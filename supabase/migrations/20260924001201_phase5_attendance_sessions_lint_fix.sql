-- AttendIQ Phase 5 lint correction: replace the session opener with an
-- explicit three-column select. The composite join previously selected all
-- schedule and offering columns into one class_schedules row variable.

create or replace function public.create_attendance_session(
  p_schedule_id uuid, p_date_ad date, p_date_bs text
) returns public.attendance_sessions language plpgsql security definer set search_path = public as $$
declare
  created_session public.attendance_sessions;
  schedule_id uuid;
  schedule_offering_id uuid;
  schedule_day smallint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'You must be signed in.';
  end if;
  if p_date_ad is null or nullif(btrim(p_date_bs), '') is null then
    raise exception using errcode = '22023', message = 'AD date and BS date are required.';
  end if;
  select schedule.id, schedule.course_offering_id, schedule.day_of_week
    into schedule_id, schedule_offering_id, schedule_day
  from public.class_schedules schedule
  join public.course_offerings offering on offering.id = schedule.course_offering_id
  where schedule.id = p_schedule_id
    and schedule.status = 'active'
    and offering.status = 'active'
    and (public.is_admin() or offering.teacher_id = auth.uid());
  if not found then
    raise exception using errcode = '42501', message = 'You can only open a session for an assigned active schedule.';
  end if;
  if extract(dow from p_date_ad) <> schedule_day then
    raise exception using errcode = '22023', message = 'The session date does not match the scheduled weekday.';
  end if;
  insert into public.attendance_sessions
    (schedule_id, course_offering_id, date_ad, date_bs, status, created_by)
  values
    (schedule_id, schedule_offering_id, p_date_ad, btrim(p_date_bs), 'open', auth.uid())
  returning * into created_session;
  return created_session;
end;
$$;

revoke all on function public.create_attendance_session(uuid, date, text) from public, anon;
grant execute on function public.create_attendance_session(uuid, date, text) to authenticated;
