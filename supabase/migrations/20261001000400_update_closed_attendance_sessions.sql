-- Allow assigned teachers and administrators to correct attendance after
-- closing a session. Cancelled sessions remain immutable.
create or replace function public.save_attendance_session(p_session_id uuid, p_records jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_count integer;
  threshold_value integer;
  auto_notify boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'You must be signed in.';
  end if;
  if p_session_id is null or p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception using errcode = '22023', message = 'Attendance records are required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) item
    where nullif(item->>'student_id', '') is null
      or item->>'status' not in ('Present', 'Absent', 'Late')
  ) then
    raise exception using errcode = '22023', message = 'Every record needs a student and Present, Absent, or Late status.';
  end if;
  if not exists (
    select 1
    from public.attendance_sessions session
    join public.course_offerings offering on offering.id = session.course_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where session.id = p_session_id
      and session.status in ('open', 'closed')
      and offering.status = 'active'
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
      and (public.is_admin() or offering.teacher_id = auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Attendance session not found or not assigned to you.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    join public.students student on student.id = item.student_id
    join public.attendance_sessions session on session.id = p_session_id
    join public.course_offerings offering on offering.id = session.course_offering_id
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where student.active = false
       or student.program <> subject.program
       or student.semester <> subject.semester
       or semester.is_current = false
       or semester.number <> subject.semester
  ) or exists (
    select 1
    from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    where not exists (select 1 from public.students student where student.id = item.student_id)
  ) then
    raise exception using errcode = '22023', message = 'Every record must belong to an active student in this program and semester.';
  end if;

  insert into public.attendance
    (student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by)
  select item.student_id, offering.subject_code, session.course_offering_id, session.id,
         session.date_ad, session.date_bs, to_char(schedule.start_time, 'HH12:MI AM'),
         item.status, auth.uid()
  from public.attendance_sessions session
  join public.class_schedules schedule on schedule.id = session.schedule_id
  join public.course_offerings offering on offering.id = session.course_offering_id
  cross join jsonb_to_recordset(p_records) item(student_id uuid, status text)
  where session.id = p_session_id
  on conflict (attendance_session_id, student_id) where attendance_session_id is not null
  do update set subject_code = excluded.subject_code,
                course_offering_id = excluded.course_offering_id,
                date_ad = excluded.date_ad,
                date_bs = excluded.date_bs,
                time = excluded.time,
                status = excluded.status,
                marked_by = excluded.marked_by;
  get diagnostics saved_count = row_count;

  select threshold, auto_notify_below_threshold
  into threshold_value, auto_notify
  from public.settings
  where id = 1;
  if auto_notify then
    insert into public.notifications (
      user_id, notification_type, title, message, related_table, related_id
    )
    select student.profile_id,
      'attendance_below_threshold',
      'Attendance below minimum',
      'Your attendance in ' || session_offering.subject_code || ' is currently ' ||
        round(count(*) filter (where attendance.status = 'Present') * 100.0 / count(*))::integer ||
        '%, below the ' || threshold_value || '% minimum.',
      'attendance_sessions',
      p_session_id::text
    from public.students student
    cross join public.attendance_sessions session
    join public.course_offerings session_offering
      on session_offering.id = session.course_offering_id
    join public.attendance on attendance.student_id = student.id
      and attendance.course_offering_id = session_offering.id
    where student.id in (
      select item.student_id
      from jsonb_to_recordset(p_records) item(student_id uuid, status text)
    )
      and session.id = p_session_id
      and student.profile_id is not null
      and not exists (
        select 1
        from public.notifications existing_notification
        where existing_notification.user_id = student.profile_id
          and existing_notification.notification_type = 'attendance_below_threshold'
          and existing_notification.related_table = 'attendance_sessions'
          and existing_notification.related_id = p_session_id::text
      )
    group by student.id, student.profile_id, session_offering.subject_code
    having round(count(*) filter (where attendance.status = 'Present') * 100.0 / count(*)) < threshold_value;
  end if;
  return saved_count;
end;
$$;

revoke all on function public.save_attendance_session(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance_session(uuid, jsonb) to authenticated;
