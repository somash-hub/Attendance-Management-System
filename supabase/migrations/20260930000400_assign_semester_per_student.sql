alter table public.students
  add column if not exists semester integer;

update public.students student
set semester = coalesce((
  select current_semester.number
  from public.semesters current_semester
  where current_semester.is_current
  order by current_semester.number
  limit 1
), 1)
where student.semester is null;

alter table public.students
  alter column semester set default 1;
alter table public.students
  alter column semester set not null;

alter table public.students
  drop constraint if exists students_semester_range;
alter table public.students
  add constraint students_semester_range check (semester between 1 and 8);

drop index if exists public.one_current_semester_idx;
update public.semesters semester
set is_current = academic_year.is_current
from public.academic_years academic_year
where academic_year.id = semester.academic_year_id;

create or replace function public.admin_set_current_semester(p_year integer, p_semester integer)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_year public.academic_years;
  selected_semester public.semesters;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can change the academic year.';
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
      true
    )
    on conflict (academic_year_id, number) do update
      set name = excluded.name,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          is_current = true;
  end loop;

  update public.academic_years set is_current = true where id = selected_year.id;
  select * into selected_semester
  from public.semesters
  where academic_year_id = selected_year.id
    and number = p_semester;
  return selected_semester;
end;
$$;

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
      and semester.number = student.semester
      and subject.semester = student.semester
      and subject.program = student.program
      and subject.active = true
  );
$$;

create or replace function public.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students student
    join public.subjects subject
      on subject.program = student.program
     and subject.semester = student.semester
    join public.course_offerings offering on offering.subject_code = subject.code
    join public.semesters semester on semester.id = offering.semester_id
    where student.id = target_student_id
      and student.active = true
      and offering.teacher_id = auth.uid()
      and offering.status = 'active'
      and subject.active = true
      and semester.is_current = true
      and semester.number = student.semester
  );
$$;

create or replace function public.teacher_can_access_offering_student(
  target_offering_id uuid,
  target_student_id uuid
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students student
    join public.course_offerings offering on offering.id = target_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where student.id = target_student_id
      and student.active = true
      and offering.teacher_id = auth.uid()
      and offering.status = 'active'
      and subject.active = true
      and subject.program = student.program
      and subject.semester = student.semester
      and semester.number = student.semester
      and semester.is_current = true
  );
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
  return saved_count;
end;
$$;

create or replace function public.admin_update_student(
  p_student_id uuid,
  p_name text,
  p_email text,
  p_roll text,
  p_program text,
  p_batch text,
  p_semester integer,
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
     or nullif(btrim(p_batch), '') is null
     or p_semester is null or p_semester not between 1 and 8 then
    raise exception using errcode = '22023', message = 'Name, email, roll number, program, batch, and semester 1-8 are required.';
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
      semester = p_semester,
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

drop policy if exists "attendance staff read" on public.attendance;
create policy "attendance staff read" on public.attendance
  for select using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and public.teacher_can_access_offering_student(course_offering_id, student_id)
      and exists (
        select 1 from public.course_offerings offering
        where offering.id = attendance.course_offering_id
          and offering.subject_code = attendance.subject_code
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
        and public.teacher_can_access_offering_student(course_offering_id, student_id)
        and exists (
          select 1 from public.course_offerings offering
          where offering.id = attendance.course_offering_id
            and offering.subject_code = attendance.subject_code
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
        and public.teacher_can_access_offering_student(course_offering_id, student_id)
      )
    )
  ) with check (
    attendance_session_id is null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and marked_by = auth.uid()
        and public.teacher_can_access_offering_student(course_offering_id, student_id)
        and exists (
          select 1 from public.course_offerings offering
          where offering.id = attendance.course_offering_id
            and offering.subject_code = attendance.subject_code
        )
      )
    )
  );

revoke all on function public.student_can_access_current_offering(uuid) from public, anon;
grant execute on function public.student_can_access_current_offering(uuid) to authenticated;
revoke all on function public.teacher_can_access_student(uuid) from public, anon;
grant execute on function public.teacher_can_access_student(uuid) to authenticated;
revoke all on function public.teacher_can_access_offering_student(uuid, uuid) from public, anon;
grant execute on function public.teacher_can_access_offering_student(uuid, uuid) to authenticated;
revoke all on function public.admin_update_student(uuid, text, text, text, text, text, integer, uuid) from public, anon;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, integer, uuid) to authenticated;
revoke all on function public.save_attendance_session(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance_session(uuid, jsonb) to authenticated;
