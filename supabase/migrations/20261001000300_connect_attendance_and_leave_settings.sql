alter table public.settings
  add column if not exists auto_notify_below_threshold boolean not null default true,
  add column if not exists leave_workflow text not null default 'teacher_admin';

alter table public.settings
  drop constraint if exists settings_leave_workflow_check;
alter table public.settings
  add constraint settings_leave_workflow_check
  check (leave_workflow in ('teacher_admin', 'admin_only', 'auto_approve'));

alter table public.leaves
  add column if not exists teacher_approved_at timestamptz,
  add column if not exists teacher_approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists teacher_review_comment text;

drop policy if exists "leaves own insert" on public.leaves;
create policy "leaves own insert" on public.leaves
  for insert with check (
    student_id = public.student_id_of()
    and status in ('pending', 'approved')
    and reviewed_by is null
    and (
      status = 'pending'
      or exists (
        select 1 from public.settings
        where id = 1 and leave_workflow = 'auto_approve'
      )
    )
    and (
      document_url is null
      or (storage.foldername(document_url))[1] = auth.uid()::text
    )
  );

create or replace function public.validate_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  workflow text;
begin
  if new.to_date < new.from_date then
    raise exception using errcode = '22023', message = 'The to date cannot be before the from date.';
  end if;
  if tg_op = 'INSERT' then
    if new.student_id is distinct from public.student_id_of() then
      raise exception using errcode = '42501', message = 'You can submit leave only for your own student account.';
    end if;
    if new.status is distinct from 'pending' then
      raise exception using errcode = '42501', message = 'New leave requests must be submitted as pending.';
    end if;
    if new.course_offering_id is not null
       and not public.student_can_access_current_offering(new.course_offering_id) then
      raise exception using errcode = '42501', message = 'Choose a subject from your current semester.';
    end if;
    select leave_workflow into workflow from public.settings where id = 1;
    new.teacher_approved_at = null;
    new.teacher_approved_by = null;
    new.teacher_review_comment = null;
    new.review_comment = null;
    new.reviewed_at = null;
    if workflow = 'auto_approve' then
      new.status = 'approved';
    end if;
  end if;
  if new.status = 'cancelled' then
    new.cancelled_at = coalesce(new.cancelled_at, now());
    new.cancelled_by = coalesce(new.cancelled_by, auth.uid());
  else
    new.cancelled_at = null;
    new.cancelled_by = null;
  end if;
  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leaves existing
    where existing.student_id = new.student_id
      and existing.id <> new.id
      and existing.status in ('pending', 'approved')
      and existing.from_date <= new.to_date
      and existing.to_date >= new.from_date
  ) then
    raise exception using errcode = '23505', message = 'This leave overlaps an existing pending or approved request.';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at = null;
      new.reviewed_by = null;
      new.review_comment = null;
      new.teacher_approved_at = null;
      new.teacher_approved_by = null;
      new.teacher_review_comment = null;
    elsif new.status in ('approved', 'rejected') then
      new.reviewed_at = now();
      new.reviewed_by = auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "validate leave requests" on public.leaves;
create trigger "validate leave requests" before insert or update on public.leaves
  for each row execute function public.validate_leave_request();

create or replace function public.teacher_can_review_leave(target_leave_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.leaves leave_request
    join public.students student on student.id = leave_request.student_id
    join public.settings app_settings on app_settings.id = 1
    where leave_request.id = target_leave_id
      and leave_request.status = 'pending'
      and leave_request.teacher_approved_at is null
      and app_settings.leave_workflow = 'teacher_admin'
      and student.active = true
      and public.role_of() = 'teacher'
      and case
        when leave_request.course_offering_id is null
          then public.teacher_can_access_student(student.id)
        else public.teacher_can_access_offering_student(
          leave_request.course_offering_id,
          student.id
        )
      end
  );
$$;

drop policy if exists "leaves staff read" on public.leaves;
create policy "leaves staff read" on public.leaves
  for select using (
    public.is_admin()
    or public.teacher_can_review_leave(id)
  );

create or replace function public.notify_leave_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  student_name text;
  subject_label text;
  workflow text;
begin
  select student.name into student_name
  from public.students student
  where student.id = new.student_id;

  if new.course_offering_id is null then
    subject_label := 'all subjects';
  else
    select subject.code || ' · ' || subject.name into subject_label
    from public.course_offerings offering
    join public.subjects subject on subject.code = offering.subject_code
    where offering.id = new.course_offering_id;
  end if;

  select leave_workflow into workflow from public.settings where id = 1;
  with recipients as (
    select profile.id as user_id
    from public.profiles profile
    where profile.role = 'admin'
      and workflow = 'admin_only'
    union
    select distinct offering.teacher_id as user_id
    from public.students student
    join public.course_offerings offering on offering.status = 'active'
    join public.subjects subject
      on subject.code = offering.subject_code
     and subject.program = student.program
     and subject.semester = student.semester
     and subject.active = true
    join public.semesters semester
      on semester.id = offering.semester_id
     and semester.number = student.semester
     and semester.is_current = true
    where student.id = new.student_id
      and student.active = true
      and offering.teacher_id is not null
      and workflow = 'teacher_admin'
      and (
        new.course_offering_id is null
        or offering.id = new.course_offering_id
      )
  )
  insert into public.notifications (
    user_id, notification_type, title, message, related_table, related_id
  )
  select recipients.user_id,
    'leave_submitted',
    'New leave request',
    coalesce(student_name, 'A student') || ' submitted a leave request for ' ||
      coalesce(subject_label, 'all subjects') || '.',
    'leaves',
    new.id::text
  from recipients;

  return new;
end;
$$;

drop trigger if exists "notify leave submission" on public.leaves;
create trigger "notify leave submission" after insert on public.leaves
  for each row execute function public.notify_leave_submission();

create or replace function public.notify_leave_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'approved')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status
         and new.status in ('approved', 'rejected', 'cancelled')) then
    insert into public.notifications (
      user_id, notification_type, title, message, related_table, related_id
    )
    select student.profile_id,
      'leave_' || new.status,
      case
        when tg_op = 'INSERT' then 'Leave request auto-approved'
        when new.status = 'approved' then 'Leave request approved'
        when new.status = 'rejected' then 'Leave request rejected'
        else 'Leave request cancelled'
      end,
      case
        when tg_op = 'INSERT' then 'Your leave request was automatically approved.'
        when new.status = 'approved' then 'Your leave request was approved.'
        when new.status = 'rejected' then 'Your leave request was rejected.'
        else 'Your leave request was cancelled.'
      end,
      'leaves',
      new.id::text
    from public.students student
    where student.id = new.student_id and student.profile_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists "notify leave decision" on public.leaves;
create trigger "notify leave decision" after insert or update on public.leaves
  for each row execute function public.notify_leave_decision();

create or replace function public.review_leave_request(
  p_leave_id bigint, p_status text, p_comment text
) returns public.leaves language plpgsql security definer set search_path = public as $$
declare
  current_leave public.leaves;
  updated_leave public.leaves;
  workflow text;
  reviewer_name text;
begin
  select * into current_leave
  from public.leaves
  where id = p_leave_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Leave request not found.';
  end if;
  if not (
    public.is_admin()
    or public.teacher_can_review_leave(p_leave_id)
  ) then
    raise exception using errcode = '42501', message = 'You are not assigned to review this leave request.';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Choose pending, approved, or rejected.';
  end if;
  select leave_workflow into workflow from public.settings where id = 1;
  if p_status = 'pending' then
    if not public.is_admin() then
      raise exception using errcode = '42501', message = 'Only an administrator can reopen a reviewed leave request.';
    end if;
    if current_leave.status = 'pending' then
      raise exception using errcode = '22023', message = 'This leave request is already pending.';
    end if;
  elsif current_leave.status <> 'pending' then
    raise exception using errcode = '22023', message = 'This leave request has already been reviewed.';
  elsif public.is_admin() and workflow = 'teacher_admin'
        and current_leave.teacher_approved_at is null then
    raise exception using errcode = '42501', message = 'A teacher must approve this request before administrator review.';
  elsif not public.is_admin() then
    if workflow <> 'teacher_admin' then
      raise exception using errcode = '42501', message = 'Only administrators can review leave requests in this workflow.';
    end if;
    if current_leave.teacher_approved_at is not null then
      raise exception using errcode = '22023', message = 'A teacher has already reviewed this leave request.';
    end if;
    if p_status = 'approved' then
      select name into reviewer_name from public.profiles where id = auth.uid();
      update public.leaves
      set teacher_approved_at = now(),
          teacher_approved_by = auth.uid(),
          teacher_review_comment = nullif(btrim(p_comment), '')
      where id = p_leave_id
      returning * into updated_leave;
      insert into public.notifications (
        user_id, notification_type, title, message, related_table, related_id
      )
      select profile.id,
        'leave_teacher_approved',
        'Leave request needs administrator review',
        coalesce(reviewer_name, 'A teacher') || ' approved ' ||
          coalesce((select student.name from public.students student where student.id = updated_leave.student_id), 'a student') ||
          '''s leave request. It is awaiting your decision.',
        'leaves',
        updated_leave.id::text
      from public.profiles profile
      where profile.role = 'admin';
      return updated_leave;
    end if;
  end if;

  update public.leaves
  set status = p_status,
      reviewed_by = case when p_status = 'pending' then null else auth.uid() end,
      reviewed_at = case when p_status = 'pending' then null else now() end,
      review_comment = case when p_status = 'pending' then null else nullif(btrim(p_comment), '') end
  where id = p_leave_id
  returning * into updated_leave;
  return updated_leave;
end;
$$;

create or replace function public.save_attendance_session(p_session_id uuid, p_records jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_count integer;
  threshold_value integer;
  auto_notify boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'You must be signed in.';
  end if;
  if p_session_id is null or p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception using errcode = '22023', message = 'Attendance records are required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) item
    where nullif(item->>'student_id', '') is null
      or item->>'status' not in ('Present', 'Absent', 'Late')
  ) then
    raise exception using errcode = '22023', message = 'Every record needs a student and Present, Absent, or Late status.';
  end if;
  if not exists (
    select 1
    from public.attendance_sessions session
    join public.course_offerings offering on offering.id = session.course_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where session.id = p_session_id
      and session.status = 'open'
      and offering.status = 'active'
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
      and (public.is_admin() or offering.teacher_id = auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Open attendance session not found or not assigned to you.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    join public.students student on student.id = item.student_id
    join public.attendance_sessions session on session.id = p_session_id
    join public.course_offerings offering on offering.id = session.course_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where student.active = false
       or student.program <> subject.program
       or student.semester <> subject.semester
       or semester.is_current = false
       or semester.number <> subject.semester
  ) or exists (
    select 1
    from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    where not exists (select 1 from public.students student where student.id = item.student_id)
  ) then
    raise exception using errcode = '22023', message = 'Every record must belong to an active student in this program and semester.';
  end if;

  insert into public.attendance
    (student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by)
  select item.student_id, offering.subject_code, session.course_offering_id, session.id,
         session.date_ad, session.date_bs, to_char(schedule.start_time, 'HH12:MI AM'),
         item.status, auth.uid()
  from public.attendance_sessions session
  join public.class_schedules schedule on schedule.id = session.schedule_id
  join public.course_offerings offering on offering.id = session.course_offering_id
  cross join jsonb_to_recordset(p_records) item(student_id uuid, status text)
  where session.id = p_session_id
  on conflict (attendance_session_id, student_id) where attendance_session_id is not null
  do update set subject_code = excluded.subject_code,
                course_offering_id = excluded.course_offering_id,
                date_ad = excluded.date_ad,
                date_bs = excluded.date_bs,
                time = excluded.time,
                status = excluded.status,
                marked_by = excluded.marked_by;
  get diagnostics saved_count = row_count;

  select threshold, auto_notify_below_threshold
  into threshold_value, auto_notify
  from public.settings
  where id = 1;
  if auto_notify then
    insert into public.notifications (
      user_id, notification_type, title, message, related_table, related_id
    )
    select student.profile_id,
      'attendance_below_threshold',
      'Attendance below minimum',
      'Your attendance in ' || session_offering.subject_code || ' is currently ' ||
        round(count(*) filter (where attendance.status = 'Present') * 100.0 / count(*))::integer ||
        '%, below the ' || threshold_value || '% minimum.',
      'attendance_sessions',
      p_session_id::text
    from public.students student
    cross join public.attendance_sessions session
    join public.course_offerings session_offering
      on session_offering.id = session.course_offering_id
    join public.attendance on attendance.student_id = student.id
      and attendance.course_offering_id = session_offering.id
    where student.id in (
      select item.student_id
      from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    )
      and session.id = p_session_id
      and student.profile_id is not null
    group by student.id, student.profile_id, session_offering.subject_code
    having round(count(*) filter (where attendance.status = 'Present') * 100.0 / count(*)) < threshold_value;
  end if;
  return saved_count;
end;
$$;

create or replace function public.notify_at_risk_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold_value integer;
  attendance_percent integer;
  student_profile_id uuid;
begin
  if public.role_of() is distinct from 'teacher'
     or not public.teacher_can_access_student(p_student_id) then
    raise exception using errcode = '42501', message = 'You are not assigned to notify this student.';
  end if;

  select student.profile_id into student_profile_id
  from public.students student
  where student.id = p_student_id and student.active = true;
  if student_profile_id is null then
    raise exception using errcode = 'P0002', message = 'Active student profile not found.';
  end if;

  select threshold into threshold_value from public.settings where id = 1;
  select coalesce(
    round(count(*) filter (where attendance.status = 'Present') * 100.0 / nullif(count(*), 0))::integer,
    0
  )
  into attendance_percent
  from public.attendance attendance
  join public.course_offerings offering
    on offering.id = attendance.course_offering_id
  join public.subjects subject
    on subject.code = offering.subject_code
  join public.semesters semester
    on semester.id = offering.semester_id
  where attendance.student_id = p_student_id
    and offering.teacher_id = auth.uid()
    and offering.status = 'active'
    and subject.active = true
    and subject.semester = semester.number
    and semester.is_current = true;
  if attendance_percent is null then
    raise exception using errcode = '22023', message = 'The student has no attendance records to evaluate.';
  end if;
  if attendance_percent >= threshold_value then
    raise exception using errcode = '22023', message = 'This student is not currently below the attendance threshold.';
  end if;

  insert into public.notifications (
    user_id, notification_type, title, message, related_table, related_id
  ) values (
    student_profile_id,
    'attendance_teacher_warning',
    'Attendance warning from your teacher',
    'Your attendance in the subjects assigned to this instructor is ' || attendance_percent ||
      '%, below the ' || threshold_value ||
      '% minimum. Please contact your instructor if you need support.',
    'students',
    p_student_id::text
  );
end;
$$;

revoke all on function public.validate_leave_request() from public, anon;
grant execute on function public.validate_leave_request() to authenticated;
revoke all on function public.notify_leave_submission() from public, anon;
grant execute on function public.notify_leave_submission() to authenticated;
revoke all on function public.notify_leave_decision() from public, anon;
grant execute on function public.notify_leave_decision() to authenticated;
revoke all on function public.review_leave_request(bigint, text, text) from public, anon;
grant execute on function public.review_leave_request(bigint, text, text) to authenticated;
revoke all on function public.save_attendance_session(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance_session(uuid, jsonb) to authenticated;
revoke all on function public.notify_at_risk_student(uuid) from public, anon;
grant execute on function public.notify_at_risk_student(uuid) to authenticated;
