-- AttendIQ Phase 3 slice 5: explicit student enrollment management.
-- Transfers archive the previous enrollment and activate the selected current
-- section. Archiving never deletes historical attendance or leave records.

create or replace function public.admin_set_student_enrollment(
  p_student_id uuid,
  p_section_id uuid
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_student public.students;
  selected_section_name text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can manage student enrollments.';
  end if;
  if p_student_id is null or p_section_id is null then
    raise exception using errcode = '22023', message = 'Student and section are required.';
  end if;

  select name into selected_section_name
  from public.sections
  where id = p_section_id and is_current = true;
  if selected_section_name is null then
    raise exception using errcode = '22023', message = 'Choose a current academic section.';
  end if;

  perform 1 from public.students where id = p_student_id and active = true for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active student record not found.';
  end if;

  update public.enrollments
  set status = 'archived', archived_at = coalesce(archived_at, now())
  where student_id = p_student_id
    and status = 'active'
    and section_id <> p_section_id;

  insert into public.enrollments (student_id, section_id, status)
  values (p_student_id, p_section_id, 'active')
  on conflict (student_id, section_id) do update
  set status = 'active', archived_at = null, enrolled_at = now();

  update public.students
  set section = selected_section_name
  where id = p_student_id;

  select * into updated_student from public.students where id = p_student_id;
  return updated_student;
end;
$$;

create or replace function public.admin_archive_student_enrollment(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_student public.students;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can archive enrollments.';
  end if;
  if p_student_id is null then
    raise exception using errcode = '22023', message = 'Student is required.';
  end if;

  update public.enrollments
  set status = 'archived', archived_at = coalesce(archived_at, now())
  where student_id = p_student_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'Active enrollment not found.';
  end if;

  select * into updated_student from public.students where id = p_student_id;
  return updated_student;
end;
$$;

revoke all on function public.admin_set_student_enrollment(uuid, uuid) from public, anon;
grant execute on function public.admin_set_student_enrollment(uuid, uuid) to authenticated;
revoke all on function public.admin_archive_student_enrollment(uuid) from public, anon;
grant execute on function public.admin_archive_student_enrollment(uuid) to authenticated;
