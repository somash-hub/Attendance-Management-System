-- AttendIQ Phase 3 slice 2: faculty create/edit/archive.
-- Account creation remains in the privileged Edge Function. These admin RPCs
-- update faculty metadata and archive faculty without deleting profile or
-- historical assignment data.

create or replace function public.admin_update_faculty(
  p_faculty_id uuid,
  p_faculty_code text,
  p_name text,
  p_email text,
  p_department text,
  p_program text,
  p_designation text,
  p_status text
)
returns public.faculty
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_faculty public.faculty;
  linked_profile_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update faculty.';
  end if;

  if p_faculty_id is null then
    raise exception using errcode = '22023', message = 'Faculty record is required.';
  end if;
  if nullif(btrim(p_faculty_code), '') is null
     or nullif(btrim(p_name), '') is null
     or nullif(btrim(p_email), '') is null
     or nullif(btrim(p_department), '') is null
     or nullif(btrim(p_program), '') is null then
    raise exception using errcode = '22023', message = 'Faculty ID, name, email, department, and program are required.';
  end if;
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.';
  end if;
  if p_status not in ('active', 'on_leave', 'archived') then
    raise exception using errcode = '22023', message = 'Choose active, on_leave, or archived status.';
  end if;

  select profile_id into linked_profile_id
  from public.faculty
  where id = p_faculty_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Faculty record not found.';
  end if;

  if linked_profile_id is not null then
    update public.profiles
    set name = btrim(p_name), email = lower(btrim(p_email))
    where id = linked_profile_id;
  end if;

  update public.faculty
  set faculty_id = btrim(p_faculty_code),
      name = btrim(p_name),
      email = lower(btrim(p_email)),
      department = btrim(p_department),
      program = btrim(p_program),
      designation = nullif(btrim(p_designation), ''),
      status = p_status,
      archived_at = case
        when p_status = 'archived' then coalesce(archived_at, now())
        else null
      end
  where id = p_faculty_id;

  select * into updated_faculty from public.faculty where id = p_faculty_id;
  return updated_faculty;
end;
$$;

create or replace function public.admin_archive_faculty(p_faculty_id uuid)
returns public.faculty
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_faculty public.faculty;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can archive faculty.';
  end if;
  if p_faculty_id is null then
    raise exception using errcode = '22023', message = 'Faculty record is required.';
  end if;

  update public.faculty
  set status = 'archived', archived_at = coalesce(archived_at, now())
  where id = p_faculty_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Faculty record not found.';
  end if;

  select * into archived_faculty from public.faculty where id = p_faculty_id;
  return archived_faculty;
end;
$$;

revoke all on function public.admin_update_faculty(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_faculty(uuid, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.admin_archive_faculty(uuid) from public, anon;
grant execute on function public.admin_archive_faculty(uuid) to authenticated;
