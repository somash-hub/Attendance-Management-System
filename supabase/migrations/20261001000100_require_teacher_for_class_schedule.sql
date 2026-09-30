-- Require schedules to reference an active course with an assigned teacher.
-- Replacing the function in place preserves its signature and grants.
create or replace function public.admin_create_class_schedule(
  p_offering_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_room text
)
returns public.class_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  created_schedule public.class_schedules;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can manage class schedules.';
  end if;
  if p_offering_id is null or p_day_of_week is null or p_day_of_week not between 0 and 6
     or p_start_time is null or p_end_time is null then
    raise exception using errcode = '22023', message = 'Course, weekday, start time, and end time are required.';
  end if;
  if p_end_time <= p_start_time then
    raise exception using errcode = '22023', message = 'End time must be after start time.';
  end if;
  if not exists (
    select 1
    from public.course_offerings offering
    join public.subjects subject on subject.code = offering.subject_code
    join public.semesters semester on semester.id = offering.semester_id
    where offering.id = p_offering_id
      and offering.status = 'active'
      and offering.teacher_id is not null
      and subject.active = true
      and subject.semester = semester.number
      and semester.is_current = true
  ) then
    raise exception using
      errcode = '22023',
      message = 'Choose an active course with an assigned teacher in the current academic year.';
  end if;

  insert into public.class_schedules
    (course_offering_id, day_of_week, start_time, end_time, room)
  values
    (p_offering_id, p_day_of_week, p_start_time, p_end_time, nullif(btrim(p_room), ''))
  returning * into created_schedule;
  return created_schedule;
end;
$$;
