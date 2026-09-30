-- Replace section-based student grouping with the college-wide current semester.
-- Keep legacy section and enrollment records for historical/audit continuity.

update public.semesters set is_current = false where is_current;
update public.academic_years set is_current = false where is_current;

insert into public.academic_years (name, start_date, end_date, is_current)
select year_number::text,
       make_date(year_number, 1, 1),
       make_date(year_number, 12, 31),
       year_number = 2026
from generate_series(2020, 2026) as years(year_number)
on conflict (name) do update
set start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_current = excluded.is_current;

insert into public.semesters
  (academic_year_id, name, number, start_date, end_date, is_current)
select academic_year.id,
       'Semester ' || semester_number,
       semester_number,
       academic_year.start_date,
       academic_year.end_date,
       academic_year.name = '2026' and semester_number = 1
from public.academic_years academic_year
cross join generate_series(1, 8) as semesters(semester_number)
where academic_year.name between '2020' and '2026'
on conflict (academic_year_id, number) do update
set name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_current = excluded.is_current;

alter table public.course_offerings
  alter column section_id drop not null;

drop index if exists public.course_offerings_unassigned_unique_idx;

do $$
begin
  if exists (
    select 1
    from public.course_offerings offering
    join public.semesters semester on semester.id = offering.semester_id
    where offering.status = 'active'
      and semester.is_current = true
    group by offering.subject_code, offering.semester_id
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate active course offerings for the same subject and semester before applying the semester-based grouping migration.';
  end if;
end;
$$;

update public.course_offerings offering
set status = 'archived',
    updated_at = now()
from public.semesters semester
where semester.id = offering.semester_id
  and semester.is_current = false
  and offering.status = 'active';

update public.attendance_sessions session
set status = 'closed',
    closed_at = coalesce(session.closed_at, now())
from public.semesters semester
where semester.is_current = false
  and session.status = 'open'
  and exists (
    select 1 from public.course_offerings offering
    where offering.id = session.course_offering_id
      and offering.semester_id = semester.id
  );

update public.enrollments
set status = 'archived',
    archived_at = coalesce(archived_at, now())
where status = 'active';

create unique index if not exists course_offerings_active_subject_semester_key
  on public.course_offerings (subject_code, semester_id)
  where status = 'active';

create or replace function public.student_can_access_current_offering(target_offering_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students student
    join public.course_offerings offering on offering.id = target_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where student.profile_id = auth.uid()
      and student.active = true
      and offering.status = 'active'
      and semester.is_current = true
      and semester.number = subject.semester
      and subject.program = student.program
  );
$$;

create or replace function public.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students student
    join public.subjects subject on subject.program = student.program
    join public.course_offerings offering on offering.subject_code = subject.code
    join public.semesters semester on semester.id = offering.semester_id
    where student.id = target_student_id
      and student.active = true
      and offering.teacher_id = auth.uid()
      and offering.status = 'active'
      and subject.active = true
      and semester.is_current = true
      and semester.number = subject.semester
  );
$$;

-- Keep the old RPC signature for compatibility; p_section_id is intentionally ignored.
create or replace function public.admin_update_student(
  p_student_id uuid,
  p_name text,
  p_email text,
  p_roll text,
  p_program text,
  p_batch text,
  p_section_id uuid
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_student public.students;
  linked_profile_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update students.';
  end if;
  if p_student_id is null then
    raise exception using errcode = '22023', message = 'Student is required.';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_email), '') is null
     or nullif(btrim(p_roll), '') is null or nullif(btrim(p_program), '') is null
     or nullif(btrim(p_batch), '') is null then
    raise exception using errcode = '22023', message = 'Name, email, roll number, program, and batch are required.';
  end if;
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.';
  end if;

  select profile_id into linked_profile_id
  from public.students
  where id = p_student_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Student record not found.';
  end if;

  if linked_profile_id is not null then
    update public.profiles
    set name = btrim(p_name), email = lower(btrim(p_email))
    where id = linked_profile_id;
  end if;

  update public.students
  set name = btrim(p_name),
      email = lower(btrim(p_email)),
      roll = btrim(p_roll),
      program = btrim(p_program),
      batch = btrim(p_batch),
      active = true,
      archived_at = null
  where id = p_student_id
  returning * into updated_student;

  update public.enrollments
  set status = 'archived',
      archived_at = coalesce(archived_at, now())
  where student_id = p_student_id
    and status = 'active';

  return updated_student;
end;
$$;

drop function if exists public.admin_set_student_enrollment(uuid, uuid);
drop function if exists public.admin_archive_student_enrollment(uuid);

drop policy if exists "sections admin write" on public.sections;
drop policy if exists "enrollments admin write" on public.enrollments;
drop policy if exists "course offerings admin write" on public.course_offerings;

drop policy if exists "course offerings read" on public.course_offerings;
create policy "course offerings read" on public.course_offerings
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.subjects subject
      join public.semesters semester on semester.id = course_offerings.semester_id
      where subject.code = course_offerings.subject_code
        and subject.active = true
        and subject.semester = semester.number
        and semester.is_current = true
        and course_offerings.status = 'active'
        and course_offerings.teacher_id = auth.uid()
    )
    or public.student_can_access_current_offering(id)
  );

drop policy if exists "class schedules read" on public.class_schedules;
create policy "class schedules read" on public.class_schedules
  for select using (
    auth.uid() is not null
    and (
      public.is_admin()
      or exists (
        select 1 from public.course_offerings offering
        join public.subjects subject on subject.code = offering.subject_code
        join public.semesters semester on semester.id = offering.semester_id
        where offering.id = class_schedules.course_offering_id
          and offering.teacher_id = auth.uid()
          and offering.status = 'active'
          and subject.active = true
          and subject.semester = semester.number
          and semester.is_current = true
      )
      or exists (
        select 1 from public.course_offerings offering
        where offering.id = class_schedules.course_offering_id
          and public.student_can_access_current_offering(offering.id)
      )
    )
  );

drop policy if exists "attendance sessions read" on public.attendance_sessions;
create policy "attendance sessions read" on public.attendance_sessions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.course_offerings offering
      join public.subjects subject on subject.code = offering.subject_code
      join public.semesters semester on semester.id = offering.semester_id
      where offering.id = attendance_sessions.course_offering_id
        and offering.status = 'active'
        and offering.teacher_id = auth.uid()
        and subject.active = true
        and subject.semester = semester.number
        and semester.is_current = true
    )
    or public.student_can_access_current_offering(attendance_sessions.course_offering_id)
  );

create or replace function public.close_attendance_session(p_session_id uuid)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_session public.attendance_sessions;
begin
  update public.attendance_sessions session
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid()
  from public.course_offerings offering
  join public.subjects subject on subject.code = offering.subject_code
  join public.semesters semester on semester.id = offering.semester_id
  where session.id = p_session_id
    and session.course_offering_id = offering.id
    and session.status = 'open'
    and offering.status = 'active'
    and subject.active = true
    and subject.semester = semester.number
    and semester.is_current = true
    and (public.is_admin() or offering.teacher_id = auth.uid())
  returning session.* into closed_session;
  if not found then
    raise exception using errcode = 'P0002', message = 'Open current-semester attendance session not found or not assigned to you.';
  end if;
  return closed_session;
end;
$$;

drop policy if exists "attendance staff read" on public.attendance;
create policy "attendance staff read" on public.attendance
  for select using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and exists (
        select 1
        from public.course_offerings offering
        join public.subjects subject on subject.code = offering.subject_code
        join public.semesters semester on semester.id = offering.semester_id
        join public.students student on student.id = attendance.student_id
        where offering.id = attendance.course_offering_id
          and offering.subject_code = attendance.subject_code
          and offering.teacher_id = auth.uid()
          and offering.status = 'active'
          and subject.active = true
          and subject.program = student.program
          and subject.semester = semester.number
          and semester.is_current = true
          and student.active = true
      )
    )
  );

drop policy if exists "attendance teacher insert" on public.attendance;
create policy "attendance teacher insert" on public.attendance
  for insert with check (
    attendance_session_id is null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and marked_by = auth.uid()
        and exists (
          select 1
          from public.course_offerings offering
          join public.subjects subject on subject.code = offering.subject_code
          join public.semesters semester on semester.id = offering.semester_id
          join public.students student on student.id = attendance.student_id
          where offering.id = attendance.course_offering_id
            and offering.subject_code = attendance.subject_code
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
            and subject.active = true
            and subject.program = student.program
            and subject.semester = semester.number
            and semester.is_current = true
            and student.active = true
        )
      )
    )
  );

drop policy if exists "attendance teacher update" on public.attendance;
create policy "attendance teacher update" on public.attendance
  for update using (
    attendance_session_id is null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and marked_by = auth.uid()
        and exists (
          select 1
          from public.course_offerings offering
          join public.subjects subject on subject.code = offering.subject_code
          join public.semesters semester on semester.id = offering.semester_id
          join public.students student on student.id = attendance.student_id
          where offering.id = attendance.course_offering_id
            and offering.subject_code = attendance.subject_code
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
            and subject.active = true
            and subject.program = student.program
            and subject.semester = semester.number
            and semester.is_current = true
            and student.active = true
        )
      )
    )
  ) with check (
    attendance_session_id is null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and marked_by = auth.uid()
        and exists (
          select 1
          from public.course_offerings offering
          join public.subjects subject on subject.code = offering.subject_code
          join public.semesters semester on semester.id = offering.semester_id
          join public.students student on student.id = attendance.student_id
          where offering.id = attendance.course_offering_id
            and offering.subject_code = attendance.subject_code
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
            and subject.active = true
            and subject.program = student.program
            and subject.semester = semester.number
            and semester.is_current = true
            and student.active = true
        )
      )
    )
  );

-- Keep the old RPC signatures for compatibility; section IDs no longer assign access.
create or replace function public.admin_create_course_offering(
  p_subject_code text,
  p_semester_id uuid,
  p_section_id uuid,
  p_teacher_id uuid
)
returns public.course_offerings
language plpgsql
security definer
set search_path = public
as $$
declare
  created_offering public.course_offerings;
  normalized_code text := upper(btrim(p_subject_code));
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can create course offerings.';
  end if;
  if normalized_code = '' or p_semester_id is null or p_teacher_id is null then
    raise exception using errcode = '22023', message = 'Subject, semester, and teacher are required.';
  end if;
  if not exists (
    select 1 from public.subjects subject
    join public.semesters semester on semester.id = p_semester_id
    where subject.code = normalized_code
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
  ) then
    raise exception using errcode = '22023', message = 'Choose an active subject belonging to the selected semester.';
  end if;
  if exists (
    select 1 from public.course_offerings offering
    where offering.subject_code = normalized_code
      and offering.semester_id = p_semester_id
      and offering.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'This subject already has an active offering in the current semester.';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    join public.faculty member on member.profile_id = profile.id
    where profile.id = p_teacher_id
      and profile.role = 'teacher'
      and member.status in ('active', 'on_leave')
  ) then
    raise exception using errcode = '22023', message = 'Choose an active faculty account.';
  end if;

  insert into public.course_offerings
    (subject_code, semester_id, section_id, teacher_id, status, created_at, updated_at)
  values
    (normalized_code, p_semester_id, null, p_teacher_id, 'active', now(), now())
  returning * into created_offering;
  return created_offering;
end;
$$;

drop function if exists public.admin_update_course_offering(uuid, uuid, text);
create or replace function public.admin_update_course_offering(
  p_offering_id uuid,
  p_teacher_id uuid,
  p_status text,
  p_section_id uuid
)
returns public.course_offerings
language plpgsql
security definer
set search_path = public
as $$
declare
  current_offering public.course_offerings;
  updated_offering public.course_offerings;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update course offerings.';
  end if;
  if p_offering_id is null or p_status not in ('active', 'archived') then
    raise exception using errcode = '22023', message = 'Offering and a valid status are required.';
  end if;
  select * into current_offering
  from public.course_offerings
  where id = p_offering_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Course offering not found.';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.subjects subject
    join public.semesters semester on semester.id = current_offering.semester_id
    where subject.code = current_offering.subject_code
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
  ) then
    raise exception using errcode = '22023', message = 'An archived or mismatched subject cannot have an active offering.';
  end if;
  if p_status = 'active' and exists (
    select 1 from public.course_offerings offering
    where offering.id <> p_offering_id
      and offering.subject_code = current_offering.subject_code
      and offering.semester_id = current_offering.semester_id
      and offering.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'This subject already has an active offering in the current semester.';
  end if;
  if p_teacher_id is not null and not exists (
    select 1
    from public.profiles profile
    join public.faculty member on member.profile_id = profile.id
    where profile.id = p_teacher_id
      and profile.role = 'teacher'
      and member.status in ('active', 'on_leave')
  ) then
    raise exception using errcode = '22023', message = 'Choose an active faculty account or leave the teacher unassigned.';
  end if;

  update public.course_offerings
  set teacher_id = p_teacher_id,
      status = p_status,
      updated_at = now()
  where id = p_offering_id
  returning * into updated_offering;
  return updated_offering;
end;
$$;

create or replace function public.admin_create_class_schedule(
  p_offering_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_room text
)
returns public.class_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  created_schedule public.class_schedules;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can manage class schedules.';
  end if;
  if p_offering_id is null or p_day_of_week is null or p_day_of_week not between 0 and 6
     or p_start_time is null or p_end_time is null then
    raise exception using errcode = '22023', message = 'Course offering, weekday, start time, and end time are required.';
  end if;
  if p_end_time <= p_start_time then
    raise exception using errcode = '22023', message = 'End time must be after start time.';
  end if;
  if not exists (
    select 1
    from public.course_offerings offering
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where offering.id = p_offering_id
      and offering.status = 'active'
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
  ) then
    raise exception using errcode = '22023', message = 'Choose an active course offering in the current semester.';
  end if;

  insert into public.class_schedules
    (course_offering_id, day_of_week, start_time, end_time, room)
  values
    (p_offering_id, p_day_of_week, p_start_time, p_end_time, nullif(btrim(p_room), ''))
  returning * into created_schedule;
  return created_schedule;
end;
$$;

create or replace function public.create_attendance_session(
  p_schedule_id uuid,
  p_date_ad date,
  p_date_bs text
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  created_session public.attendance_sessions;
  schedule_id uuid;
  schedule_offering_id uuid;
  schedule_day smallint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'You must be signed in.';
  end if;
  if p_date_ad is null or nullif(btrim(p_date_bs), '') is null then
    raise exception using errcode = '22023', message = 'AD date and BS date are required.';
  end if;

  select schedule.id, schedule.course_offering_id, schedule.day_of_week
    into schedule_id, schedule_offering_id, schedule_day
  from public.class_schedules schedule
  join public.course_offerings offering on offering.id = schedule.course_offering_id
  join public.subjects subject on subject.code = offering.subject_code
  join public.semesters semester on semester.id = offering.semester_id
  where schedule.id = p_schedule_id
    and schedule.status = 'active'
    and offering.status = 'active'
    and subject.active = true
    and subject.semester = semester.number
    and semester.is_current = true
    and (public.is_admin() or offering.teacher_id = auth.uid());
  if not found then
    raise exception using errcode = '42501', message = 'You can only open a session for an assigned active schedule in the current semester.';
  end if;
  if extract(dow from p_date_ad) <> schedule_day then
    raise exception using errcode = '22023', message = 'The session date does not match the scheduled weekday.';
  end if;

  insert into public.attendance_sessions
    (schedule_id, course_offering_id, date_ad, date_bs, status, created_by)
  values
    (schedule_id, schedule_offering_id, p_date_ad, btrim(p_date_bs), 'open', auth.uid())
  returning * into created_session;
  return created_session;
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
       or semester.is_current = false
       or semester.number <> subject.semester
  ) or exists (
    select 1
    from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    where not exists (select 1 from public.students student where student.id = item.student_id)
  ) then
    raise exception using errcode = '22023', message = 'Every record must belong to an active student in this program and current semester.';
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
  return saved_count;
end;
$$;

create or replace function public.admin_set_current_semester(p_year integer, p_semester integer)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_year public.academic_years;
  selected_semester public.semesters;
  semester_number integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can change the current semester.';
  end if;
  if p_year is null or p_year < 2020 or p_year > 9999
     or p_semester is null or p_semester not between 1 and 8 then
    raise exception using errcode = '22023', message = 'Choose a year from 2020 onward and a semester from 1 to 8.';
  end if;

  update public.semesters set is_current = false where is_current;
  update public.academic_years set is_current = false where is_current;

  insert into public.academic_years (name, start_date, end_date, is_current)
  values (p_year::text, make_date(p_year, 1, 1), make_date(p_year, 12, 31), false)
  on conflict (name) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        is_current = false
  returning * into selected_year;

  for semester_number in 1..8 loop
    insert into public.semesters
      (academic_year_id, name, number, start_date, end_date, is_current)
    values (
      selected_year.id,
      'Semester ' || semester_number,
      semester_number,
      selected_year.start_date,
      selected_year.end_date,
      false
    )
    on conflict (academic_year_id, number) do update
      set name = excluded.name,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          is_current = false;
  end loop;

  update public.academic_years set is_current = true where id = selected_year.id;
  update public.semesters
  set is_current = (number = p_semester)
  where academic_year_id = selected_year.id;
  select * into selected_semester
  from public.semesters
  where academic_year_id = selected_year.id
    and number = p_semester;

  return selected_semester;
end;
$$;

revoke all on function public.student_can_access_current_offering(uuid) from public, anon;
grant execute on function public.student_can_access_current_offering(uuid) to authenticated;
revoke all on function public.teacher_can_access_student(uuid) from public, anon;
grant execute on function public.teacher_can_access_student(uuid) to authenticated;
revoke all on function public.admin_create_course_offering(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_create_course_offering(text, uuid, uuid, uuid) to authenticated;
revoke all on function public.admin_update_course_offering(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.admin_update_course_offering(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.admin_create_class_schedule(uuid, smallint, time, time, text) from public, anon;
grant execute on function public.admin_create_class_schedule(uuid, smallint, time, time, text) to authenticated;
revoke all on function public.create_attendance_session(uuid, date, text) from public, anon;
grant execute on function public.create_attendance_session(uuid, date, text) to authenticated;
revoke all on function public.close_attendance_session(uuid) from public, anon;
grant execute on function public.close_attendance_session(uuid) to authenticated;
revoke all on function public.save_attendance_session(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance_session(uuid, jsonb) to authenticated;
revoke all on function public.admin_set_current_semester(integer, integer) from public, anon;
grant execute on function public.admin_set_current_semester(integer, integer) to authenticated;
