-- AttendIQ Phase 2: academic structure, enrollment, and course offerings.
-- Apply after Phase 1. Legacy students, subjects, attendance, and leave rows are
-- preserved. New relationships are added first, then existing demo data is
-- backfilled to the current academic structure.

-- 1. Academic structure -------------------------------------------------------

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  number int not null check (number between 1 and 8),
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (academic_year_id, number),
  check (end_date >= start_date)
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  semester_id uuid references public.semesters (id) on delete set null,
  program text not null,
  batch text not null,
  name text not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (academic_year_id, semester_id, program, batch, name)
);

create table if not exists public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null references public.subjects (code) on delete restrict,
  semester_id uuid not null references public.semesters (id) on delete restrict,
  section_id uuid not null references public.sections (id) on delete restrict,
  teacher_id uuid references public.profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_code, semester_id, section_id)
);

create table if not exists public.enrollments (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  enrolled_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (student_id, section_id)
);

-- Add link columns before backfill. Constraints are added after the existing
-- rows are linked, which avoids taking cross-table locks during the backfill.
alter table public.attendance
  add column if not exists course_offering_id uuid;
alter table public.leaves
  add column if not exists section_id uuid;

alter table public.subjects add column if not exists credits numeric(4,1);
alter table public.subjects add column if not exists course_type text not null default 'theory';
-- 2. Backfill the current demo academic structure -----------------------------

insert into public.academic_years (name, start_date, end_date, is_current)
values ('2082/83 BS', '2025-04-01', '2026-03-31', true)
on conflict (name) do update
set start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_current = excluded.is_current;

insert into public.semesters (academic_year_id, name, number, start_date, end_date, is_current)
select ay.id, 'Semester 7', 7, '2025-06-01', '2025-10-31', true
from public.academic_years ay
where ay.name = '2082/83 BS'
on conflict (academic_year_id, number) do update
set name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_current = excluded.is_current;

insert into public.sections
  (academic_year_id, semester_id, program, batch, name, is_current)
select ay.id, sem.id, 'BSc CSIT', '2079', 'A', true
from public.academic_years ay
join public.semesters sem on sem.academic_year_id = ay.id
where ay.name = '2082/83 BS' and sem.number = 7
on conflict (academic_year_id, semester_id, program, batch, name) do update
set is_current = excluded.is_current;

insert into public.course_offerings
  (subject_code, semester_id, section_id, teacher_id, status)
select subject.code, sem.id, section.id, subject.teacher_id, 'active'
from public.subjects subject
join public.academic_years ay on ay.name = '2082/83 BS'
join public.semesters sem
  on sem.academic_year_id = ay.id and sem.number = subject.semester
join public.sections section
  on section.academic_year_id = ay.id
 and section.semester_id = sem.id
 and section.program = subject.program
where section.is_current
on conflict (subject_code, semester_id, section_id) do update
set teacher_id = excluded.teacher_id,
    status = 'active';

insert into public.enrollments (student_id, section_id, status)
select student.id, section.id, 'active'
from public.students student
join public.sections section
  on section.program = student.program
 and section.batch = student.batch
 and section.name = coalesce(nullif(student.section, ''), 'A')
 and section.is_current
on conflict (student_id, section_id) do update
set status = 'active';

update public.attendance attendance_row
set course_offering_id = offering.id
from public.course_offerings offering
join public.enrollments enrollment on enrollment.section_id = offering.section_id
where attendance_row.course_offering_id is null
  and enrollment.student_id = attendance_row.student_id
  and enrollment.status = 'active'
  and offering.subject_code = attendance_row.subject_code
  and offering.status = 'active';

update public.leaves leave_row
set section_id = chosen.section_id
from (
  select distinct on (enrollment.student_id)
    enrollment.student_id, enrollment.section_id
  from public.enrollments enrollment
  where enrollment.status = 'active'
  order by enrollment.student_id, enrollment.id
) chosen
where leave_row.section_id is null
  and chosen.student_id = leave_row.student_id;


-- Cross-table integrity: a section belongs to one academic year and semester,
-- and a course offering cannot point at a section from another semester.
alter table public.semesters
  drop constraint if exists semesters_id_academic_year_key;
alter table public.semesters
  add constraint semesters_id_academic_year_key unique (id, academic_year_id);
alter table public.sections
  drop constraint if exists sections_semester_year_fk;
alter table public.sections
  add constraint sections_semester_year_fk
  foreign key (semester_id, academic_year_id)
  references public.semesters (id, academic_year_id);
alter table public.sections
  drop constraint if exists sections_id_semester_key;
alter table public.sections
  add constraint sections_id_semester_key unique (id, semester_id);
alter table public.course_offerings
  drop constraint if exists course_offerings_section_semester_fk;

-- Link the legacy records to their academic resources after the backfill.
alter table public.attendance
  drop constraint if exists attendance_course_offering_fk;
alter table public.attendance
  add constraint attendance_course_offering_fk
  foreign key (course_offering_id) references public.course_offerings (id) on delete set null;
alter table public.leaves
  drop constraint if exists leaves_section_fk;
alter table public.leaves
  add constraint leaves_section_fk
  foreign key (section_id) references public.sections (id) on delete set null;

alter table public.course_offerings
  add constraint course_offerings_section_semester_fk
  foreign key (section_id, semester_id)
  references public.sections (id, semester_id);

-- Complete subject metadata and relational indexes.
alter table public.subjects add column if not exists active boolean not null default true;
alter table public.subjects add column if not exists archived_at timestamptz;
alter table public.subjects
  drop constraint if exists subjects_credits_positive;
alter table public.subjects
  add constraint subjects_credits_positive check (credits is null or credits > 0);

create index if not exists semesters_academic_year_idx
  on public.semesters (academic_year_id, number);
create index if not exists sections_current_idx
  on public.sections (program, batch, name) where is_current;
create index if not exists course_offerings_teacher_idx
  on public.course_offerings (teacher_id, status);
create index if not exists course_offerings_section_idx
  on public.course_offerings (section_id, status);
create index if not exists enrollments_student_idx
  on public.enrollments (student_id, status);
create index if not exists attendance_offering_idx
  on public.attendance (course_offering_id);

create unique index if not exists one_current_academic_year_idx
  on public.academic_years (is_current) where is_current;
create unique index if not exists one_current_semester_idx
  on public.semesters (is_current) where is_current;

-- 3. Relationship helpers and RLS ---------------------------------------------

create or replace function public.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.enrollments enrollment
    join public.course_offerings offering on offering.section_id = enrollment.section_id
    where enrollment.student_id = target_student_id
      and enrollment.status = 'active'
      and offering.teacher_id = auth.uid()
      and offering.status = 'active'
  );
$$;

create or replace function public.teacher_can_access_subject(target_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.course_offerings offering
    where offering.subject_code = target_code
      and offering.teacher_id = auth.uid()
      and offering.status = 'active'
  ) or exists (
    select 1 from public.subjects subject
    where subject.code = target_code and subject.teacher_id = auth.uid()
  );
$$;

alter table public.academic_years enable row level security;
alter table public.semesters enable row level security;
alter table public.sections enable row level security;
alter table public.enrollments enable row level security;
alter table public.course_offerings enable row level security;

drop policy if exists "academic years read" on public.academic_years;
create policy "academic years read" on public.academic_years
  for select using (auth.uid() is not null);
drop policy if exists "academic years admin write" on public.academic_years;
create policy "academic years admin write" on public.academic_years
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "semesters read" on public.semesters;
create policy "semesters read" on public.semesters
  for select using (auth.uid() is not null);
drop policy if exists "semesters admin write" on public.semesters;
create policy "semesters admin write" on public.semesters
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sections read" on public.sections;
create policy "sections read" on public.sections
  for select using (auth.uid() is not null);
drop policy if exists "sections admin write" on public.sections;
create policy "sections admin write" on public.sections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "enrollments read" on public.enrollments;
create policy "enrollments read" on public.enrollments
  for select using (
    public.is_admin()
    or student_id = public.student_id_of()
    or public.teacher_can_access_student(student_id)
  );
drop policy if exists "enrollments admin write" on public.enrollments;
create policy "enrollments admin write" on public.enrollments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "course offerings read" on public.course_offerings;
create policy "course offerings read" on public.course_offerings
  for select using (
    public.is_admin()
    or teacher_id = auth.uid()
    or exists (
      select 1 from public.enrollments enrollment
      where enrollment.section_id = course_offerings.section_id

        and enrollment.student_id = public.student_id_of()
        and enrollment.status = 'active'
      )
  );
drop policy if exists "course offerings admin write" on public.course_offerings;
create policy "course offerings admin write" on public.course_offerings
  for all using (public.is_admin()) with check (public.is_admin());


-- Existing resources use the new relationships when a legacy row has a link.
-- The subject fallback keeps old teacher assignments working during migration.
drop policy if exists "subjects read" on public.subjects;
create policy "subjects read" on public.subjects
  for select using (
    public.is_admin()
    or public.role_of() = 'student'
    or public.teacher_can_access_subject(code)
  );

drop policy if exists "students read" on public.students;
create policy "students read" on public.students
  for select using (
    public.is_admin()
    or profile_id = auth.uid()
    or public.teacher_can_access_student(id)
  );

drop policy if exists "attendance staff read" on public.attendance;
create policy "attendance staff read" on public.attendance
  for select using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and (
        exists (
          select 1 from public.course_offerings offering
          where offering.id = course_offering_id
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
        )
        or exists (
          select 1 from public.subjects subject
          where subject.code = subject_code and subject.teacher_id = auth.uid()
        )
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
      and (
        exists (
          select 1 from public.course_offerings offering
          where offering.id = course_offering_id
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
        )
        or exists (
          select 1 from public.subjects subject
          where subject.code = subject_code and subject.teacher_id = auth.uid()
        )
      )
    )
  );
drop policy if exists "attendance teacher update" on public.attendance;
create policy "attendance teacher update" on public.attendance
  for update using (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and (
        exists (
          select 1 from public.course_offerings offering
          where offering.id = course_offering_id
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
        )
        or exists (
          select 1 from public.subjects subject
          where subject.code = subject_code and subject.teacher_id = auth.uid()
        )
      )
    )
  ) with check (
    public.is_admin()
    or (
      public.role_of() = 'teacher'
      and marked_by = auth.uid()
      and (
        exists (
          select 1 from public.course_offerings offering
          where offering.id = course_offering_id
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
        )
        or exists (
          select 1 from public.subjects subject
          where subject.code = subject_code and subject.teacher_id = auth.uid()
        )
      )
    )
  );
drop policy if exists "attendance admin delete" on public.attendance;
create policy "attendance admin delete" on public.attendance
  for delete using (public.is_admin());

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

drop policy if exists "leave docs authenticated read" on storage.objects;
create policy "leave docs authenticated read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'leave-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.leaves leave_request
        where leave_request.document_url = name
          and public.teacher_can_access_student(leave_request.student_id)
      )
    )
  );

-- 4. Audit academic records ---------------------------------------------------

drop trigger if exists "audit academic year changes" on public.academic_years;
create trigger "audit academic year changes"
  after insert or update or delete on public.academic_years
  for each row execute function public.audit_row_change();
drop trigger if exists "audit semester changes" on public.semesters;
create trigger "audit semester changes"
  after insert or update or delete on public.semesters
  for each row execute function public.audit_row_change();
drop trigger if exists "audit section changes" on public.sections;
create trigger "audit section changes"
  after insert or update or delete on public.sections
  for each row execute function public.audit_row_change();
drop trigger if exists "audit enrollment changes" on public.enrollments;
create trigger "audit enrollment changes"
  after insert or update or delete on public.enrollments
  for each row execute function public.audit_row_change();
drop trigger if exists "audit course offering changes" on public.course_offerings;
create trigger "audit course offering changes"
  after insert or update or delete on public.course_offerings
  for each row execute function public.audit_row_change();

