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

  delete from public.audit_logs where true;
  delete from public.notifications where true;
  update public.attendance set attendance_session_id = null;
  delete from public.attendance_sessions where true;
  delete from public.attendance where true;
  delete from public.leaves where true;
  delete from public.class_schedules where true;
  delete from public.course_offerings where true;
  delete from public.enrollments where true;
  delete from public.students where true;
  delete from public.faculty where true;
  delete from public.subjects where true;
  delete from public.sections where true;
  delete from public.academic_events where true;
  delete from public.semesters where true;
  delete from public.academic_years where true;

  update public.settings set threshold = 80 where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;
