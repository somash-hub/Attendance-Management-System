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

  delete from public.audit_logs where id is not null;
  delete from public.notifications where id is not null;
  update public.attendance set attendance_session_id = null where id is not null;
  delete from public.attendance_sessions where id is not null;
  delete from public.attendance where id is not null;
  delete from public.leaves where id is not null;
  delete from public.class_schedules where id is not null;
  delete from public.course_offerings where id is not null;
  delete from public.enrollments where id is not null;
  delete from public.students where id is not null;
  delete from public.faculty where id is not null;
  delete from public.subjects where code is not null;
  delete from public.sections where id is not null;
  delete from public.academic_events where id is not null;
  delete from public.semesters where id is not null;
  delete from public.academic_years where id is not null;

  update public.settings set threshold = 80 where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;
