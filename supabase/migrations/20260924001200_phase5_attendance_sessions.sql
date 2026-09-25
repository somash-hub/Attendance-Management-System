-- AttendIQ Phase 5 slice 1: scheduled attendance sessions.
-- Legacy attendance rows remain valid. New session rows use the optional
-- attendance_session_id link and are written only through the RPCs below.

alter table public.class_schedules
  drop constraint if exists class_schedules_id_offering_key;
alter table public.class_schedules
  add constraint class_schedules_id_offering_key
  unique (id, course_offering_id);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  course_offering_id uuid not null,
  date_ad date not null,
  date_bs text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  unique (schedule_id, date_ad),
  foreign key (schedule_id, course_offering_id)
    references public.class_schedules (id, course_offering_id) on delete restrict,
  foreign key (course_offering_id)
    references public.course_offerings (id) on delete restrict,
  check (btrim(date_bs) <> '')
);

alter table public.attendance
  add column if not exists attendance_session_id uuid;
alter table public.attendance
  drop constraint if exists attendance_session_fk;
alter table public.attendance
  add constraint attendance_session_fk
  foreign key (attendance_session_id)
  references public.attendance_sessions (id) on delete restrict;

create unique index if not exists attendance_session_student_key
  on public.attendance (attendance_session_id, student_id)
  where attendance_session_id is not null;
create index if not exists attendance_sessions_offering_date_idx
  on public.attendance_sessions (course_offering_id, date_ad, status);
create index if not exists attendance_sessions_schedule_date_idx
  on public.attendance_sessions (schedule_id, date_ad);

-- A teacher can open one session for an assigned active schedule and date.
create or replace function public.create_attendance_session(
  p_schedule_id uuid, p_date_ad date, p_date_bs text
) returns public.attendance_sessions language plpgsql security definer set search_path = public as $$
declare created_session public.attendance_sessions; schedule_row public.class_schedules%rowtype;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'You must be signed in.'; end if;
  if p_date_ad is null or nullif(btrim(p_date_bs), '') is null then raise exception using errcode = '22023', message = 'AD date and BS date are required.'; end if;
  select * into schedule_row from public.class_schedules schedule join public.course_offerings offering on offering.id = schedule.course_offering_id
  where schedule.id = p_schedule_id and schedule.status = 'active' and offering.status = 'active' and (public.is_admin() or offering.teacher_id = auth.uid());
  if not found then raise exception using errcode = '42501', message = 'You can only open a session for an assigned active schedule.'; end if;
  if extract(dow from p_date_ad) <> schedule_row.day_of_week then raise exception using errcode = '22023', message = 'The session date does not match the scheduled weekday.'; end if;
  insert into public.attendance_sessions (schedule_id, course_offering_id, date_ad, date_bs, status, created_by)
  values (schedule_row.id, schedule_row.course_offering_id, p_date_ad, btrim(p_date_bs), 'open', auth.uid()) returning * into created_session;
  return created_session;
end; $$;


create or replace function public.close_attendance_session(p_session_id uuid)
returns public.attendance_sessions language plpgsql security definer set search_path = public as $$
declare closed_session public.attendance_sessions;
begin
  update public.attendance_sessions session set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where session.id = p_session_id and session.status = 'open'
    and exists (select 1 from public.course_offerings offering where offering.id = session.course_offering_id and offering.status = 'active' and (public.is_admin() or offering.teacher_id = auth.uid()))
  returning * into closed_session;
  if not found then raise exception using errcode = 'P0002', message = 'Open attendance session not found or not assigned to you.'; end if;
  return closed_session;
end; $$;


-- Save all marks for an open assigned session in one database operation.
create or replace function public.save_attendance_session(p_session_id uuid, p_records jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare saved_count integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'You must be signed in.'; end if;
  if p_session_id is null or p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception using errcode = '22023', message = 'Attendance records are required.'; end if;
  if exists (select 1 from jsonb_array_elements(p_records) item where nullif(item->>'student_id', '') is null or item->>'status' not in ('Present', 'Absent', 'Late')) then raise exception using errcode = '22023', message = 'Every record needs a student and Present, Absent, or Late status.'; end if;
  if not exists (select 1 from public.attendance_sessions session join public.course_offerings offering on offering.id = session.course_offering_id where session.id = p_session_id and session.status = 'open' and offering.status = 'active' and (public.is_admin() or offering.teacher_id = auth.uid())) then raise exception using errcode = '42501', message = 'Open attendance session not found or not assigned to you.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_records) item(student_id uuid, status text) where not exists (select 1 from public.enrollments enrollment join public.attendance_sessions session on session.id = p_session_id join public.course_offerings offering on offering.id = session.course_offering_id where enrollment.student_id = item.student_id and enrollment.section_id = offering.section_id and enrollment.status = 'active')) then raise exception using errcode = '22023', message = 'Every record must belong to an active enrolled student.'; end if;
  insert into public.attendance (student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by)
  select item.student_id, offering.subject_code, session.course_offering_id, session.id, session.date_ad, session.date_bs, to_char(schedule.start_time, 'HH12:MI AM'), item.status, auth.uid()
  from public.attendance_sessions session join public.class_schedules schedule on schedule.id = session.schedule_id join public.course_offerings offering on offering.id = session.course_offering_id cross join jsonb_to_recordset(p_records) item(student_id uuid, status text)
  where session.id = p_session_id
  on conflict (attendance_session_id, student_id) where attendance_session_id is not null do update set subject_code = excluded.subject_code, course_offering_id = excluded.course_offering_id, date_ad = excluded.date_ad, date_bs = excluded.date_bs, time = excluded.time, status = excluded.status, marked_by = excluded.marked_by;
  get diagnostics saved_count = row_count;
  return saved_count;
end; $$;
-- Session visibility follows the offering relationship.
alter table public.attendance_sessions enable row level security;
drop policy if exists "attendance sessions read" on public.attendance_sessions;
create policy "attendance sessions read" on public.attendance_sessions for select using (
  public.is_admin()
  or exists (select 1 from public.course_offerings offering where offering.id = attendance_sessions.course_offering_id and offering.status = 'active' and offering.teacher_id = auth.uid())
  or exists (select 1 from public.enrollments enrollment join public.course_offerings offering on offering.id = attendance_sessions.course_offering_id where enrollment.section_id = offering.section_id and enrollment.student_id = public.student_id_of() and enrollment.status = 'active')
);
drop policy if exists "attendance sessions direct insert" on public.attendance_sessions;
create policy "attendance sessions direct insert" on public.attendance_sessions for insert with check (false);
drop policy if exists "attendance sessions direct update" on public.attendance_sessions;
create policy "attendance sessions direct update" on public.attendance_sessions for update using (false) with check (false);
drop policy if exists "attendance sessions direct delete" on public.attendance_sessions;
create policy "attendance sessions direct delete" on public.attendance_sessions for delete using (false);
-- Legacy attendance writes remain available only for rows without a session link.
-- Session-linked attendance is written by save_attendance_session() as SECURITY DEFINER.
drop policy if exists "attendance teacher insert" on public.attendance;
create policy "attendance teacher insert" on public.attendance
  for insert with check (
    attendance_session_id is null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and marked_by = auth.uid()
        and (
          exists (select 1 from public.course_offerings offering where offering.id = course_offering_id and offering.teacher_id = auth.uid() and offering.status = 'active')
          or exists (select 1 from public.subjects subject where subject.code = subject_code and subject.teacher_id = auth.uid())
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
      or (public.role_of() = 'teacher' and marked_by = auth.uid() and (exists (select 1 from public.course_offerings offering where offering.id = course_offering_id and offering.teacher_id = auth.uid() and offering.status = 'active') or exists (select 1 from public.subjects subject where subject.code = subject_code and subject.teacher_id = auth.uid())))
    )
  ) with check (
    attendance_session_id is null
    and (
      public.is_admin()
      or (public.role_of() = 'teacher' and marked_by = auth.uid() and (exists (select 1 from public.course_offerings offering where offering.id = course_offering_id and offering.teacher_id = auth.uid() and offering.status = 'active') or exists (select 1 from public.subjects subject where subject.code = subject_code and subject.teacher_id = auth.uid())))
    )
  );



revoke all on function public.create_attendance_session(uuid, date, text) from public, anon;
grant execute on function public.create_attendance_session(uuid, date, text) to authenticated;
revoke all on function public.close_attendance_session(uuid) from public, anon;
grant execute on function public.close_attendance_session(uuid) to authenticated;
revoke all on function public.save_attendance_session(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance_session(uuid, jsonb) to authenticated;

drop trigger if exists "audit attendance session changes" on public.attendance_sessions;
create trigger "audit attendance session changes" after insert or update or delete on public.attendance_sessions for each row execute function public.audit_row_change();
