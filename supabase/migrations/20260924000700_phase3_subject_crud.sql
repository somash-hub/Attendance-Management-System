-- AttendIQ Phase 3 slice 3: subject catalog create/edit/archive.
-- Subject codes are stable identifiers once created. Archiving preserves the
-- subject and its historical attendance/course-offering relationships.

alter table public.subjects
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.admin_create_subject(
  p_code text,
  p_name text,
  p_semester integer,
  p_program text,
  p_credits numeric,
  p_course_type text
)
returns public.subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  created_subject public.subjects;
  normalized_code text := upper(btrim(p_code));
  normalized_name text := btrim(p_name);
  normalized_program text := btrim(p_program);
  normalized_type text := lower(btrim(p_course_type));
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can create subjects.';
  end if;

  if normalized_code !~ '^[A-Z]{2,4}[0-9]{3,4}$' then
    raise exception using errcode = '22023', message = 'Subject code must contain 2–4 letters followed by 3–4 numbers.';
  end if;
  if nullif(normalized_name, '') is null or nullif(normalized_program, '') is null then
    raise exception using errcode = '22023', message = 'Subject name and program are required.';
  end if;
  if p_semester is null or p_semester not between 1 and 8 then
    raise exception using errcode = '22023', message = 'Semester must be between 1 and 8.';
  end if;
  if p_credits is null or p_credits <= 0 or p_credits > 30 then
    raise exception using errcode = '22023', message = 'Credits must be greater than 0 and no more than 30.';
  end if;
  if normalized_type not in ('theory', 'lab', 'project') then
    raise exception using errcode = '22023', message = 'Choose theory, lab, or project as the course type.';
  end if;

  insert into public.subjects
    (code, name, semester, program, credits, course_type, active, archived_at, updated_at)
  values
    (normalized_code, normalized_name, p_semester, normalized_program, p_credits, normalized_type, true, null, now())
  returning * into created_subject;

  return created_subject;
end;
$$;

create or replace function public.admin_update_subject(
  p_code text,
  p_name text,
  p_semester integer,
  p_program text,
  p_credits numeric,
  p_course_type text,
  p_active boolean
)
returns public.subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_subject public.subjects;
  normalized_code text := upper(btrim(p_code));
  normalized_name text := btrim(p_name);
  normalized_program text := btrim(p_program);
  normalized_type text := lower(btrim(p_course_type));
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update subjects.';
  end if;
  if normalized_code !~ '^[A-Z]{2,4}[0-9]{3,4}$' then
    raise exception using errcode = '22023', message = 'Subject code must contain 2–4 letters followed by 3–4 numbers.';
  end if;
  if nullif(normalized_name, '') is null or nullif(normalized_program, '') is null then
    raise exception using errcode = '22023', message = 'Subject name and program are required.';
  end if;
  if p_semester is null or p_semester not between 1 and 8 then
    raise exception using errcode = '22023', message = 'Semester must be between 1 and 8.';
  end if;
  if p_credits is null or p_credits <= 0 or p_credits > 30 then
    raise exception using errcode = '22023', message = 'Credits must be greater than 0 and no more than 30.';
  end if;
  if normalized_type not in ('theory', 'lab', 'project') then
    raise exception using errcode = '22023', message = 'Choose theory, lab, or project as the course type.';
  end if;
  if p_active is null then
    raise exception using errcode = '22023', message = 'Choose active or archived status.';
  end if;

  update public.subjects
  set name = normalized_name,
      semester = p_semester,
      program = normalized_program,
      credits = p_credits,
      course_type = normalized_type,
      active = p_active,
      archived_at = case when p_active then null else coalesce(archived_at, now()) end,
      updated_at = now()
  where code = normalized_code;

  if not found then
    raise exception using errcode = 'P0002', message = 'Subject not found.';
  end if;

  select * into updated_subject from public.subjects where code = normalized_code;
  return updated_subject;
end;
$$;

create or replace function public.admin_archive_subject(p_code text)
returns public.subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_subject public.subjects;
  normalized_code text := upper(btrim(p_code));
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can archive subjects.';
  end if;

  update public.subjects
  set active = false,
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where code = normalized_code;

  if not found then
    raise exception using errcode = 'P0002', message = 'Subject not found.';
  end if;

  select * into archived_subject from public.subjects where code = normalized_code;
  return archived_subject;
end;
$$;

revoke all on function public.admin_create_subject(text, text, integer, text, numeric, text) from public, anon;
grant execute on function public.admin_create_subject(text, text, integer, text, numeric, text) to authenticated;
revoke all on function public.admin_update_subject(text, text, integer, text, numeric, text, boolean) from public, anon;
grant execute on function public.admin_update_subject(text, text, integer, text, numeric, text, boolean) to authenticated;
revoke all on function public.admin_archive_subject(text) from public, anon;
grant execute on function public.admin_archive_subject(text) to authenticated;

drop trigger if exists "audit subject changes" on public.subjects;
create trigger "audit subject changes"
  after insert or update or delete on public.subjects
  for each row execute function public.audit_row_change();
