alter table public.leaves
  add column if not exists course_offering_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leaves_course_offering_id_fkey'
      and conrelid = 'public.leaves'::regclass
  ) then
    alter table public.leaves
      add constraint leaves_course_offering_id_fkey
      foreign key (course_offering_id)
      references public.course_offerings (id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists leaves_course_offering_idx
  on public.leaves (course_offering_id, created_at desc)
  where course_offering_id is not null;

create or replace function public.get_my_leave_subjects()
returns table (
  course_offering_id uuid,
  subject_code text,
  subject_name text,
  teacher_name text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.role_of() <> 'student' then
    raise exception using errcode = '42501', message = 'Only students can load their leave subjects.';
  end if;

  return query
  select offering.id, offering.subject_code, subject.name, teacher.name
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
  left join public.profiles teacher on teacher.id = offering.teacher_id
  where student.profile_id = auth.uid()
    and student.active = true
  order by offering.subject_code;
end;
$$;

create or replace function public.teacher_can_review_leave(target_leave_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.leaves leave_request
    join public.students student on student.id = leave_request.student_id
    where leave_request.id = target_leave_id
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

create or replace function public.validate_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.to_date < new.from_date then
    raise exception using errcode = '22023', message = 'The to date cannot be before the from date.';
  end if;
  if tg_op = 'INSERT' then
    if new.student_id is distinct from public.student_id_of() then
      raise exception using errcode = '42501', message = 'You can submit leave only for your own student account.';
    end if;
    if new.course_offering_id is not null
       and not public.student_can_access_current_offering(new.course_offering_id) then
      raise exception using errcode = '42501', message = 'Choose a subject from your current semester.';
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

drop policy if exists "leaves staff read" on public.leaves;
create policy "leaves staff read" on public.leaves
  for select using (
    public.is_admin()
    or public.teacher_can_review_leave(id)
  );

drop policy if exists "leave docs authenticated read" on storage.objects;
create policy "leave docs authenticated read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1
        from public.leaves leave_request
        where leave_request.document_url = name
          and public.teacher_can_review_leave(leave_request.id)
      )
    )
  );

create or replace function public.notify_leave_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  student_name text;
  subject_label text;
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

  with recipients as (
    select profile.id as user_id
    from public.profiles profile
    where profile.role = 'admin'
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

create or replace function public.review_leave_request(
  p_leave_id bigint, p_status text, p_comment text
) returns public.leaves language plpgsql security definer set search_path = public as $$
declare
  current_leave public.leaves;
  updated_leave public.leaves;
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
  if p_status = 'pending' then
    if not public.is_admin() then
      raise exception using errcode = '42501', message = 'Only an administrator can reopen a reviewed leave request.';
    end if;
    if current_leave.status = 'pending' then
      raise exception using errcode = '22023', message = 'This leave request is already pending.';
    end if;
  elsif current_leave.status <> 'pending' then
    raise exception using errcode = '22023', message = 'This leave request has already been reviewed.';
  end if;

  update public.leaves
  set status = p_status,
      reviewed_by = case when p_status = 'pending' then null else auth.uid() end,
      reviewed_at = case when p_status = 'pending' then null else now() end,
      review_comment = case when p_status = 'pending' then nullif(btrim(p_comment), '') end
  where id = p_leave_id
  returning * into updated_leave;
  return updated_leave;
end;
$$;

revoke all on function public.get_my_leave_subjects() from public, anon;
grant execute on function public.get_my_leave_subjects() to authenticated;
revoke all on function public.teacher_can_review_leave(bigint) from public, anon;
grant execute on function public.teacher_can_review_leave(bigint) to authenticated;
revoke all on function public.validate_leave_request() from public, anon;
grant execute on function public.validate_leave_request() to authenticated;
revoke all on function public.notify_leave_submission() from public, anon;
grant execute on function public.notify_leave_submission() to authenticated;
revoke all on function public.review_leave_request(bigint, text, text) from public, anon;
grant execute on function public.review_leave_request(bigint, text, text) to authenticated;
