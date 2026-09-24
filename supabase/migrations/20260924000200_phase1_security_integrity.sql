-- AttendIQ Phase 1: security, data integrity, audit history, and safe account lifecycle.
-- Apply after the initial schema migration. Existing attendance and leave rows are preserved.

-- Faculty details remain separate from auth identity so faculty records can be
-- managed and archived without duplicating login credentials.
create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  faculty_id text not null unique,
  name text not null,
  email text,
  department text not null default 'BSc CSIT',
  program text not null default 'BSc CSIT',
  designation text,
  status text not null default 'active' check (status in ('active', 'on_leave', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- Preserve student and faculty history when an administrator removes a login.
alter table public.students add column if not exists active boolean not null default true;
alter table public.students add column if not exists archived_at timestamptz;
alter table public.faculty add column if not exists archived_at timestamptz;
-- Faculty is an admin-managed directory. A teacher can read only their own row.
alter table public.faculty enable row level security;
drop policy if exists "faculty admin read" on public.faculty;
create policy "faculty admin read" on public.faculty
  for select using (public.is_admin());
drop policy if exists "faculty own read" on public.faculty;
create policy "faculty own read" on public.faculty
  for select using (profile_id = auth.uid());
drop policy if exists "faculty admin write" on public.faculty;
create policy "faculty admin write" on public.faculty
  for insert with check (public.is_admin());
drop policy if exists "faculty admin update" on public.faculty;
create policy "faculty admin update" on public.faculty
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "faculty admin delete" on public.faculty;
create policy "faculty admin delete" on public.faculty
  for delete using (public.is_admin());

-- Audit rows are read-only to administrators. The Edge Functions use the
-- service role to write account lifecycle events; application writes will be
-- added as server-side operations in the next slice.
alter table public.audit_logs enable row level security;
drop policy if exists "audit logs admin read" on public.audit_logs;
create policy "audit logs admin read" on public.audit_logs
  for select using (public.is_admin());


create index if not exists students_active_idx on public.students (active);
create index if not exists faculty_active_idx on public.faculty (status);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- Backfill the one existing teacher profile into the faculty directory.
insert into public.faculty (profile_id, faculty_id, name, email, department, program, status)
select p.id, 'FAC001', p.name, p.email, 'BSc CSIT', 'BSc CSIT', 'active'
from public.profiles p
where p.role = 'teacher' and p.email = 'priya.mehta@kct.edu.np'
on conflict (profile_id) do update set name = excluded.name, email = excluded.email;

-- Relationship helper used by the Phase 1 RLS policies. The function is
-- security-definer so the lookup does not recurse through the students policy.
create or replace function public.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students s
    join public.subjects subject on subject.program = s.program
    where s.id = target_student_id
      and subject.teacher_id = auth.uid()
  );
$$;

-- Subjects: students can read the catalog, teachers can read their assigned
-- subjects, and administrators can read all subjects.
drop policy if exists "subjects read" on public.subjects;
create policy "subjects read" on public.subjects
  for select using (
    public.is_admin()
    or public.role_of() = 'student'
    or (public.role_of() = 'teacher' and teacher_id = auth.uid())
  );

-- Students: own row, administrators, and the current teacher's assigned
-- program roster. Section-level scoping is added in Phase 2.
drop policy if exists "students read" on public.students;
create policy "students read" on public.students
  for select using (
    public.is_admin()
    or profile_id = auth.uid()
    or public.teacher_can_access_student(id)
  );

-- Leave requests: own row, administrators, or students in the teacher's
-- assigned program. Storage uses the same relationship for document review.
drop policy if exists "leaves staff read" on public.leaves;
create policy "leaves staff read" on public.leaves
  for select using (
    public.is_admin()
    or (public.role_of() = 'teacher' and public.teacher_can_access_student(student_id))
  );
drop policy if exists "leaves staff update" on public.leaves;
create policy "leaves staff update" on public.leaves
  for update using (
    public.is_admin()
    or (public.role_of() = 'teacher' and public.teacher_can_access_student(student_id))
  ) with check (
    public.is_admin()
    or (public.role_of() = 'teacher' and public.teacher_can_access_student(student_id))
  );

-- Private leave documents: owner, administrators, or a teacher assigned to
-- the related student. Students cannot list or read another student's folder.
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
          and public.teacher_can_access_student(leave_request.student_id)
      )
    )
  );

-- Leave documents are limited to supported document/image types and 5 MB.
drop policy if exists "leave docs own upload" on storage.objects;
create policy "leave docs own upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '\.(pdf|jpe?g|png)$'
    and lower(coalesce(metadata->>'mimetype', '')) in
      ('application/pdf', 'image/jpeg', 'image/png')
    and case
      when coalesce(metadata->>'size', '') ~ '^[0-9]+$'
        then (metadata->>'size')::bigint <= 5242880
      else false
    end
  );

-- Reject a role update that would remove the final administrator.
create or replace function public.prevent_last_admin_demotion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be demoted.';
  end if;
  return new;
end;
$$;
drop trigger if exists "protect last admin" on public.profiles;
create trigger "protect last admin"
  before update of role on public.profiles
  for each row execute function public.prevent_last_admin_demotion();

-- Capture application and account changes without trusting client-supplied
-- actor ids. The trigger always uses auth.uid() and runs with database access.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_id text;
begin
  row_id := coalesce(
    (to_jsonb(new)->>'id'),
    (to_jsonb(old)->>'id'),
    (to_jsonb(new)->>'code'),
    (to_jsonb(old)->>'code'),
    (to_jsonb(new)->>'roll'),
    (to_jsonb(old)->>'roll')
  );
  insert into public.audit_logs
    (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    auth.uid(),
    lower(TG_OP) || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    row_id,
    case when TG_OP = 'DELETE' then to_jsonb(old) else null end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists "audit faculty changes" on public.faculty;
create trigger "audit faculty changes" after insert or update or delete on public.faculty
  for each row execute function public.audit_row_change();
drop trigger if exists "audit profile changes" on public.profiles;
create trigger "audit profile changes" after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();
drop trigger if exists "audit settings changes" on public.settings;
create trigger "audit settings changes" after insert or update or delete on public.settings
  for each row execute function public.audit_row_change();
drop trigger if exists "audit subject changes" on public.subjects;
create trigger "audit subject changes" after insert or update or delete on public.subjects
  for each row execute function public.audit_row_change();
drop trigger if exists "audit student changes" on public.students;
create trigger "audit student changes" after insert or update or delete on public.students
  for each row execute function public.audit_row_change();
drop trigger if exists "audit attendance changes" on public.attendance;
create trigger "audit attendance changes" after insert or update or delete on public.attendance
  for each row execute function public.audit_row_change();
drop trigger if exists "audit leave changes" on public.leaves;
create trigger "audit leave changes" after insert or update or delete on public.leaves
  for each row execute function public.audit_row_change();
