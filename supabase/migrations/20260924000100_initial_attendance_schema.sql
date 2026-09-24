-- AttendIQ Supabase schema: tables, row level security, and demo seeds.
-- Run order: create the three demo accounts first (see supabase/SETUP.md),
-- then run this file in the SQL editor. Everything can be re-run safely.

-- 1. Tables -----------------------------------------------------------------

-- One row per login account. Mirrors auth.users and carries the app role.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now()
);

-- Attendance settings shared by every portal (single row).
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  threshold int not null default 80 check (threshold between 40 and 100)
);

insert into public.settings (id, threshold)
values (1, 80)
on conflict (id) do nothing;

-- BSc CSIT Semester 7 subjects taught by the assigned teacher.
create table if not exists public.subjects (
  code text primary key,
  name text not null,
  semester int not null default 7,
  program text not null default 'BSc CSIT',
  teacher_id uuid references public.profiles (id) on delete set null
);

-- Student roster; profile_id links a row to a login account when one exists.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  roll text not null unique,
  name text not null,
  email text,
  program text not null default 'BSc CSIT',
  batch text not null default '2079',
  section text default 'A'
);

-- One attendance mark per student, subject, date, and session time.
create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  subject_code text not null references public.subjects (code) on delete cascade,
  date_ad date not null,
  date_bs text not null,
  time text not null default '09:00 AM',
  status text not null check (status in ('Present', 'Absent', 'Late')),
  marked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, subject_code, date_ad, time)
);

create index if not exists attendance_student_idx
  on public.attendance (student_id, subject_code);
create index if not exists attendance_subject_date_idx
  on public.attendance (subject_code, date_ad);

-- Leave applications with an approval workflow.
create table if not exists public.leaves (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  type text not null check (type in ('Medical', 'Personal', 'College Event')),
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  document_url text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);

-- 2. Role helpers used by the row level security policies --------------------

-- Returns the role stored in the caller's profile (security definer so the
-- lookup itself is not blocked by row level security).
create or replace function public.role_of() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select public.role_of() = 'admin' $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select public.role_of() in ('admin', 'teacher') $$;

-- The student row that belongs to the signed-in account (null for staff).
create or replace function public.student_id_of() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.students where profile_id = auth.uid() $$;

-- 3. Row level security -------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.leaves enable row level security;

-- Profiles: users read their own row; administrators read and manage all.
-- Account creation and deletion happen in the admin edge functions instead.
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles admin read" on public.profiles;
create policy "profiles admin read" on public.profiles
  for select using (public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Settings: readable by every signed-in user; only administrators change them.
drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings
  for select using (auth.uid() is not null);
drop policy if exists "settings admin update" on public.settings;
create policy "settings admin update" on public.settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Subjects and students: readable by signed-in users; written by admins only.
drop policy if exists "subjects read" on public.subjects;
create policy "subjects read" on public.subjects
  for select using (auth.uid() is not null);
drop policy if exists "subjects admin write" on public.subjects;
create policy "subjects admin write" on public.subjects
  for insert with check (public.is_admin());
drop policy if exists "subjects admin update" on public.subjects;
create policy "subjects admin update" on public.subjects
  for update using (public.is_admin());
drop policy if exists "subjects admin delete" on public.subjects;
create policy "subjects admin delete" on public.subjects
  for delete using (public.is_admin());

drop policy if exists "students read" on public.students;
create policy "students read" on public.students
  for select using (auth.uid() is not null);
drop policy if exists "students admin write" on public.students;
create policy "students admin write" on public.students
  for insert with check (public.is_admin());
drop policy if exists "students admin update" on public.students;
create policy "students admin update" on public.students
  for update using (public.is_admin());
drop policy if exists "students admin delete" on public.students;
create policy "students admin delete" on public.students
  for delete using (public.is_admin());

-- Attendance: students read their own marks, teachers read and write the
-- records of the subjects assigned to them, administrators manage everything.
drop policy if exists "attendance own read" on public.attendance;
create policy "attendance own read" on public.attendance
  for select using (student_id = public.student_id_of());
drop policy if exists "attendance staff read" on public.attendance;
create policy "attendance staff read" on public.attendance
  for select using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and exists (
        select 1 from public.subjects s
        where s.code = subject_code and s.teacher_id = auth.uid()
      )
    )
  );
drop policy if exists "attendance teacher insert" on public.attendance;
create policy "attendance teacher insert" on public.attendance
  for insert with check (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and marked_by = auth.uid()
      and exists (
        select 1 from public.subjects s
        where s.code = subject_code and s.teacher_id = auth.uid()
      )
    )
  );
drop policy if exists "attendance teacher update" on public.attendance;
create policy "attendance teacher update" on public.attendance
  for update using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and exists (
        select 1 from public.subjects s
        where s.code = subject_code and s.teacher_id = auth.uid()
      )
    )
  ) with check (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and marked_by = auth.uid()
      and exists (
        select 1 from public.subjects s
        where s.code = subject_code and s.teacher_id = auth.uid()
      )
    )
  );
drop policy if exists "attendance admin delete" on public.attendance;
create policy "attendance admin delete" on public.attendance
  for delete using (public.is_admin());

-- Leaves: students raise and view their own requests; staff review them.
drop policy if exists "leaves own read" on public.leaves;
create policy "leaves own read" on public.leaves
  for select using (student_id = public.student_id_of());
drop policy if exists "leaves staff read" on public.leaves;
create policy "leaves staff read" on public.leaves
  for select using (public.is_staff());
drop policy if exists "leaves own insert" on public.leaves;
create policy "leaves own insert" on public.leaves
  for insert with check (
    student_id = public.student_id_of()
    and status = 'pending'
    and reviewed_by is null
    and (
      document_url is null
      or (storage.foldername(document_url))[1] = auth.uid()::text
    )
  );
drop policy if exists "leaves staff update" on public.leaves;
create policy "leaves staff update" on public.leaves
  for update using (public.is_staff()) with check (public.is_staff());

-- 4. Storage bucket for leave documents ---------------------------------------

insert into storage.buckets (id, name, public)
values ('leave-documents', 'leave-documents', false)
on conflict (id) do nothing;

-- Students upload into their own folder; staff can read every document.
drop policy if exists "leave docs own upload" on storage.objects;
create policy "leave docs own upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'leave-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- Students read their own documents; staff review every leave document.
drop policy if exists "leave docs authenticated read" on storage.objects;
create policy "leave docs authenticated read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-documents'
    and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- 5. Demo seeds ---------------------------------------------------------------
-- The three accounts must exist in Authentication -> Users first (see
-- supabase/SETUP.md). These inserts find them by email and do nothing while
-- the users are missing, so the file can be re-run at any time.

insert into public.profiles (id, name, email, role)
select u.id, 'System Administrator', 'admin@kct.edu.np', 'admin'
from auth.users u where u.email = 'admin@kct.edu.np'
on conflict (id) do nothing;

insert into public.profiles (id, name, email, role)
select u.id, 'Dr. Priya Mehta', 'priya.mehta@kct.edu.np', 'teacher'
from auth.users u where u.email = 'priya.mehta@kct.edu.np'
on conflict (id) do nothing;

insert into public.profiles (id, name, email, role)
select u.id, 'Aryan Kumar', 'aryan.k@kct.edu.np', 'student'
from auth.users u where u.email = 'aryan.k@kct.edu.np'
on conflict (id) do nothing;

-- Semester 7 subjects; Dr. Priya Mehta currently teaches them all.
insert into public.subjects (code, name, semester, program, teacher_id)
select v.code, v.name, 7, 'BSc CSIT',
       (select id from public.profiles where email = 'priya.mehta@kct.edu.np')
from (values
  ('CSC419', 'Advanced Java Programming'),
  ('CSC420', 'Data Warehousing and Data Mining'),
  ('CSC421', 'Principles of Management'),
  ('CSC422', 'Project Work'),
  ('CSC425', 'Software Project Management')
) as v(code, name)
on conflict (code) do nothing;

-- Batch 2079 roster; Aryan's row links to his login account afterwards.
insert into public.students (roll, name, email, program, batch)
values
  ('2079CSIT042', 'Aryan Kumar', 'aryan.k@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT043', 'Sneha Patel', 'sneha.p@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT044', 'Riya Desai', 'riya.d@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT045', 'Karan Singh', 'karan.s@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT046', 'Pooja Iyer', 'pooja.i@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT047', 'Dev Malhotra', 'dev.m@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT048', 'Ananya Nair', 'ananya.n@kct.edu.np', 'BSc CSIT', '2079'),
  ('2079CSIT049', 'Vivek Rao', 'vivek.r@kct.edu.np', 'BSc CSIT', '2079')
on conflict (roll) do nothing;

update public.students s
set profile_id = p.id
from public.profiles p
where s.roll = '2079CSIT042' and p.email = 'aryan.k@kct.edu.np';

-- Aryan's attendance history (Ashadh 20-24, 2082) shown in the portal log.
insert into public.attendance
  (student_id, subject_code, date_ad, date_bs, time, status, marked_by)
select s.id, v.subject_code, v.date_ad::date, v.date_bs, v.time, v.status,
       (select id from public.profiles where email = 'priya.mehta@kct.edu.np')
from public.students s
cross join (values
  ('CSC419', '2025-07-08', 'Ashadh 24, 2082', '09:00 AM', 'Present'),
  ('CSC420', '2025-07-08', 'Ashadh 24, 2082', '11:00 AM', 'Present'),
  ('CSC421', '2025-07-08', 'Ashadh 24, 2082', '02:00 PM', 'Absent'),
  ('CSC422', '2025-07-07', 'Ashadh 23, 2082', '10:00 AM', 'Present'),
  ('CSC425', '2025-07-07', 'Ashadh 23, 2082', '12:00 PM', 'Present'),
  ('CSC419', '2025-07-07', 'Ashadh 23, 2082', '09:00 AM', 'Late'),
  ('CSC420', '2025-07-04', 'Ashadh 20, 2082', '11:00 AM', 'Absent'),
  ('CSC421', '2025-07-04', 'Ashadh 20, 2082', '02:00 PM', 'Present')
) as v(subject_code, date_ad, date_bs, time, status)
where s.roll = '2079CSIT042'
on conflict (student_id, subject_code, date_ad, time) do nothing;

-- Demo leave requests (the same rows shown in the prototype).
insert into public.leaves (student_id, type, from_date, to_date, reason, status)
select s.id, v.type, v.from_date::date, v.to_date::date, v.reason, v.status
from public.students s
join (values
  ('2079CSIT042', 'Medical', '2025-07-10', '2025-07-11', 'Fever and doctor visit', 'pending'),
  ('2079CSIT044', 'Personal', '2025-07-09', '2025-07-09', 'Family function', 'pending'),
  ('2079CSIT047', 'Medical', '2025-07-07', '2025-07-08', 'Hospital visit', 'approved'),
  ('2079CSIT045', 'Personal', '2025-07-05', '2025-07-05', 'Personal emergency', 'rejected')
) as v(roll, type, from_date, to_date, reason, status) on v.roll = s.roll
where not exists (
  select 1 from public.leaves l
  where l.student_id = s.id and l.from_date = v.from_date::date
);