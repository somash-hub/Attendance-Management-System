-- AttendIQ Phase 3 slice 6: academic calendar and class schedules.

create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  semester_id uuid references public.semesters (id) on delete set null,
  title text not null,
  event_type text not null check (event_type in ('semester', 'exam', 'result', 'holiday', 'college_event', 'sports')),
  start_date date not null,
  end_date date not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references public.course_offerings (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  room text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (course_offering_id, day_of_week, start_time, status)
);

create index if not exists academic_events_year_date_idx on public.academic_events (academic_year_id, start_date, status);
create index if not exists class_schedules_offering_day_idx on public.class_schedules (course_offering_id, day_of_week, status);

create or replace function public.admin_create_academic_event(
  p_academic_year_id uuid, p_semester_id uuid, p_title text, p_event_type text,
  p_start_date date, p_end_date date, p_description text
) returns public.academic_events language plpgsql security definer set search_path = public as $$
declare created_event public.academic_events;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can manage academic events.'; end if;
  if p_academic_year_id is null or nullif(btrim(p_title), '') is null or p_start_date is null or p_end_date is null then raise exception using errcode = '22023', message = 'Academic year, title, start date, and end date are required.'; end if;
  if p_end_date < p_start_date then raise exception using errcode = '22023', message = 'End date cannot be before start date.'; end if;
  if lower(btrim(p_event_type)) not in ('semester', 'exam', 'result', 'holiday', 'college_event', 'sports') then raise exception using errcode = '22023', message = 'Choose a valid academic event type.'; end if;
  if not exists (select 1 from public.academic_years where id = p_academic_year_id) then raise exception using errcode = '22023', message = 'Choose a valid academic year.'; end if;
  if p_semester_id is not null and not exists (select 1 from public.semesters where id = p_semester_id and academic_year_id = p_academic_year_id) then raise exception using errcode = '22023', message = 'Choose a semester from the selected academic year.'; end if;
  insert into public.academic_events (academic_year_id, semester_id, title, event_type, start_date, end_date, description)
  values (p_academic_year_id, p_semester_id, btrim(p_title), lower(btrim(p_event_type)), p_start_date, p_end_date, nullif(btrim(p_description), ''))
  returning * into created_event;
  return created_event;
end;
$$;

create or replace function public.admin_update_academic_event(
  p_event_id uuid, p_title text, p_event_type text, p_start_date date, p_end_date date,
  p_description text, p_status text
) returns public.academic_events language plpgsql security definer set search_path = public as $$
declare updated_event public.academic_events;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can update academic events.'; end if;
  if p_event_id is null or nullif(btrim(p_title), '') is null or p_start_date is null or p_end_date is null or p_status not in ('active', 'archived') then raise exception using errcode = '22023', message = 'Event title, dates, and status are required.'; end if;
  if p_end_date < p_start_date then raise exception using errcode = '22023', message = 'End date cannot be before start date.'; end if;
  if lower(btrim(p_event_type)) not in ('semester', 'exam', 'result', 'holiday', 'college_event', 'sports') then raise exception using errcode = '22023', message = 'Choose a valid academic event type.'; end if;
  update public.academic_events set title = btrim(p_title), event_type = lower(btrim(p_event_type)), start_date = p_start_date, end_date = p_end_date, description = nullif(btrim(p_description), ''), status = p_status, updated_at = now() where id = p_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'Academic event not found.'; end if;
  select * into updated_event from public.academic_events where id = p_event_id;
  return updated_event;
end;
$$;
create or replace function public.admin_archive_academic_event(p_event_id uuid)
returns public.academic_events language plpgsql security definer set search_path = public as $$
declare archived_event public.academic_events;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can archive academic events.'; end if;
  update public.academic_events set status = 'archived', updated_at = now() where id = p_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'Academic event not found.'; end if;
  select * into archived_event from public.academic_events where id = p_event_id;
  return archived_event;
end;
$$;


create or replace function public.admin_create_class_schedule(
  p_offering_id uuid, p_day_of_week smallint, p_start_time time, p_end_time time, p_room text
) returns public.class_schedules language plpgsql security definer set search_path = public as $$
declare created_schedule public.class_schedules;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can manage class schedules.'; end if;
  if p_offering_id is null or p_day_of_week is null or p_day_of_week not between 0 and 6 or p_start_time is null or p_end_time is null then raise exception using errcode = '22023', message = 'Course offering, weekday, start time, and end time are required.'; end if;
  if p_end_time <= p_start_time then raise exception using errcode = '22023', message = 'End time must be after start time.'; end if;
  if not exists (select 1 from public.course_offerings where id = p_offering_id and status = 'active') then raise exception using errcode = '22023', message = 'Choose an active course offering.'; end if;
  insert into public.class_schedules (course_offering_id, day_of_week, start_time, end_time, room) values (p_offering_id, p_day_of_week, p_start_time, p_end_time, nullif(btrim(p_room), '')) returning * into created_schedule;
  return created_schedule;
end;
$$;

create or replace function public.admin_update_class_schedule(
  p_schedule_id uuid, p_day_of_week smallint, p_start_time time, p_end_time time, p_room text, p_status text
) returns public.class_schedules language plpgsql security definer set search_path = public as $$
declare updated_schedule public.class_schedules;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can update class schedules.'; end if;
  if p_schedule_id is null or p_day_of_week is null or p_day_of_week not between 0 and 6 or p_start_time is null or p_end_time is null or p_status not in ('active', 'archived') then raise exception using errcode = '22023', message = 'Schedule day, times, and status are required.'; end if;
  if p_end_time <= p_start_time then raise exception using errcode = '22023', message = 'End time must be after start time.'; end if;
  update public.class_schedules set day_of_week = p_day_of_week, start_time = p_start_time, end_time = p_end_time, room = nullif(btrim(p_room), ''), status = p_status, updated_at = now() where id = p_schedule_id;
  if not found then raise exception using errcode = 'P0002', message = 'Class schedule not found.'; end if;
  select * into updated_schedule from public.class_schedules where id = p_schedule_id;
  return updated_schedule;
end;
$$;

create or replace function public.admin_archive_class_schedule(p_schedule_id uuid)
returns public.class_schedules language plpgsql security definer set search_path = public as $$
declare archived_schedule public.class_schedules;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Only administrators can archive class schedules.'; end if;
  update public.class_schedules set status = 'archived', updated_at = now() where id = p_schedule_id;
  if not found then raise exception using errcode = 'P0002', message = 'Class schedule not found.'; end if;
  select * into archived_schedule from public.class_schedules where id = p_schedule_id;
  return archived_schedule;
end;
$$;

revoke all on function public.admin_create_academic_event(uuid, uuid, text, text, date, date, text) from public, anon;
grant execute on function public.admin_create_academic_event(uuid, uuid, text, text, date, date, text) to authenticated;
revoke all on function public.admin_update_academic_event(uuid, text, text, date, date, text, text) from public, anon;
grant execute on function public.admin_update_academic_event(uuid, text, text, date, date, text, text) to authenticated;
revoke all on function public.admin_archive_academic_event(uuid) from public, anon;
grant execute on function public.admin_archive_academic_event(uuid) to authenticated;
revoke all on function public.admin_create_class_schedule(uuid, smallint, time, time, text) from public, anon;
grant execute on function public.admin_create_class_schedule(uuid, smallint, time, time, text) to authenticated;
revoke all on function public.admin_update_class_schedule(uuid, smallint, time, time, text, text) from public, anon;
grant execute on function public.admin_update_class_schedule(uuid, smallint, time, time, text, text) to authenticated;
revoke all on function public.admin_archive_class_schedule(uuid) from public, anon;
grant execute on function public.admin_archive_class_schedule(uuid) to authenticated;

alter table public.academic_events enable row level security;
alter table public.class_schedules enable row level security;
drop policy if exists "academic events read" on public.academic_events;
create policy "academic events read" on public.academic_events for select using (auth.uid() is not null);
drop policy if exists "academic events admin write" on public.academic_events;
create policy "academic events admin write" on public.academic_events for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "class schedules read" on public.class_schedules;
create policy "class schedules read" on public.class_schedules for select using (auth.uid() is not null);
drop policy if exists "class schedules admin write" on public.class_schedules;
create policy "class schedules admin write" on public.class_schedules for all using (public.is_admin()) with check (public.is_admin());
drop trigger if exists "audit academic event changes" on public.academic_events;
create trigger "audit academic event changes" after insert or update or delete on public.academic_events for each row execute function public.audit_row_change();
drop trigger if exists "audit class schedule changes" on public.class_schedules;
create trigger "audit class schedule changes" after insert or update or delete on public.class_schedules for each row execute function public.audit_row_change();
