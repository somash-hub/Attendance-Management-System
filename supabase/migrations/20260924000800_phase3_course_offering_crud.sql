-- AttendIQ Phase 3 slice 4: course-offering creation and teacher assignment.
-- The offering identity (subject + semester + section) is stable. Only the
-- assigned teacher and active/archive status can be changed after creation.

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
  if normalized_code = '' or p_semester_id is null or p_section_id is null or p_teacher_id is null then
    raise exception using errcode = '22023', message = 'Subject, semester, section, and teacher are required.';
  end if;
  if not exists (select 1 from public.subjects where code = normalized_code and active = true) then
    raise exception using errcode = '22023', message = 'Choose an active subject.';
  end if;
  if not exists (select 1 from public.semesters where id = p_semester_id) then
    raise exception using errcode = '22023', message = 'Choose a valid semester.';
  end if;
  if not exists (select 1 from public.sections where id = p_section_id and semester_id = p_semester_id) then
    raise exception using errcode = '22023', message = 'The selected section does not belong to the semester.';
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
    (normalized_code, p_semester_id, p_section_id, p_teacher_id, 'active', now(), now())
  returning * into created_offering;
  return created_offering;
end;
$$;

create or replace function public.admin_update_course_offering(
  p_offering_id uuid,
  p_teacher_id uuid,
  p_status text
)
returns public.course_offerings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_offering public.course_offerings;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update course offerings.';
  end if;
  if p_offering_id is null or p_status not in ('active', 'archived') then
    raise exception using errcode = '22023', message = 'Offering and a valid status are required.';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.course_offerings offering
    join public.subjects subject on subject.code = offering.subject_code
    where offering.id = p_offering_id and subject.active = true
  ) then
    raise exception using errcode = '22023', message = 'An archived subject cannot have an active offering.';
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
  where id = p_offering_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Course offering not found.';
  end if;

  select * into updated_offering from public.course_offerings where id = p_offering_id;
  return updated_offering;
end;
$$;

create or replace function public.admin_archive_course_offering(p_offering_id uuid)
returns public.course_offerings
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_offering public.course_offerings;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can archive course offerings.';
  end if;
  update public.course_offerings
  set status = 'archived', updated_at = now()
  where id = p_offering_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Course offering not found.';
  end if;
  select * into archived_offering from public.course_offerings where id = p_offering_id;
  return archived_offering;
end;
$$;

revoke all on function public.admin_create_course_offering(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_create_course_offering(text, uuid, uuid, uuid) to authenticated;
revoke all on function public.admin_update_course_offering(uuid, uuid, text) from public, anon;
grant execute on function public.admin_update_course_offering(uuid, uuid, text) to authenticated;
revoke all on function public.admin_archive_course_offering(uuid) from public, anon;
grant execute on function public.admin_archive_course_offering(uuid) to authenticated;
