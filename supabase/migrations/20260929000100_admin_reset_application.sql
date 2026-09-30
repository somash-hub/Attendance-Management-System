create or replace function public.admin_reset_application_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reset application data.';
  end if;

  delete from public.audit_logs;
  delete from public.notifications;
  update public.attendance set attendance_session_id = null;
  delete from public.attendance_sessions;
  delete from public.attendance;
  delete from public.leaves;
  delete from public.class_schedules;
  delete from public.course_offerings;
  delete from public.enrollments;
  delete from public.students;
  delete from public.faculty;
  delete from public.subjects;
  delete from public.sections;
  delete from public.academic_events;
  delete from public.semesters;
  delete from public.academic_years;

  update public.settings
  set threshold = 80
  where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_reset_application_data() from public;
grant execute on function public.admin_reset_application_data() to authenticated;
