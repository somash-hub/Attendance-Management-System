-- AttendIQ Phase 3 slice 1: student create/edit/archive.
-- Account creation remains in the privileged Edge Function. This migration adds
-- atomic administrator operations for updating student directory data and for
-- archiving a student without deleting attendance or leave history.

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
  current_student public.students;
  updated_student public.students;
  linked_profile_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update students.';
  end if;

  if p_student_id is null or p_section_id is null then
    raise exception using errcode = '22023', message = 'Student and section are required.';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_email), '') is null
     or nullif(btrim(p_roll), '') is null or nullif(btrim(p_program), '') is null
     or nullif(btrim(p_batch), '') is null then
    raise exception using errcode = '22023', message = 'Name, email, roll number, program, and batch are required.';
  end if;
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.';
  end if;
  if not exists (
    select 1 from public.sections
    where id = p_section_id
      and is_current
      and program = btrim(p_program)
      and batch = btrim(p_batch)
  ) then
    raise exception using errcode = '22023', message = 'Choose a current section matching the program and batch.';
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
      email = nullif(lower(btrim(p_email)), ''),
      roll = btrim(p_roll),
      program = btrim(p_program),
      batch = btrim(p_batch),
      section = (select name from public.sections where id = p_section_id),
      active = true,
      archived_at = null
  where id = p_student_id;

  update public.enrollments
  set status = 'archived', archived_at = coalesce(archived_at, now())
  where student_id = p_student_id
    and section_id <> p_section_id
    and status = 'active';

  insert into public.enrollments (student_id, section_id, status)
  values (p_student_id, p_section_id, 'active')
  on conflict (student_id, section_id) do update
  set status = 'active', archived_at = null;

  select * into updated_student from public.students where id = p_student_id;
  return updated_student;
end;
$$;

create or replace function public.admin_archive_student(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_student public.students;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can archive students.';
  end if;
  if p_student_id is null then
    raise exception using errcode = '22023', message = 'Student is required.';
  end if;

  update public.students
  set active = false, archived_at = coalesce(archived_at, now())
  where id = p_student_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Student record not found.';
  end if;

  update public.enrollments
  set status = 'archived', archived_at = coalesce(archived_at, now())
  where student_id = p_student_id and status = 'active';

  select * into archived_student from public.students where id = p_student_id;
  return archived_student;
end;
$$;

revoke all on function public.admin_update_student(uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, uuid) to authenticated;
revoke all on function public.admin_archive_student(uuid) from public, anon;
grant execute on function public.admin_archive_student(uuid) to authenticated;
