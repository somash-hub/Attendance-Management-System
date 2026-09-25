-- AttendIQ Phase 3 follow-up: schedule uniqueness and relationship-aware reads.
-- This migration follows 20260924001000 and is safe to re-run.

alter table public.class_schedules
  drop constraint if exists class_schedules_course_offering_id_day_of_week_start_time_status_key;
alter table public.class_schedules
  drop constraint if exists class_schedules_offering_day_start_key;
alter table public.class_schedules
  add constraint class_schedules_offering_day_start_key
  unique (course_offering_id, day_of_week, start_time);

drop policy if exists "class schedules read" on public.class_schedules;
create policy "class schedules read" on public.class_schedules
  for select
  using (
    auth.uid() is not null
    and (
      public.is_admin()
      or (
        public.role_of() = 'teacher'
        and exists (
          select 1
          from public.course_offerings offering
          where offering.id = class_schedules.course_offering_id
            and offering.teacher_id = auth.uid()
            and offering.status = 'active'
        )
      )
      or (
        public.role_of() = 'student'
        and exists (
          select 1
          from public.enrollments enrollment
          join public.course_offerings offering
            on offering.section_id = enrollment.section_id
          where offering.id = class_schedules.course_offering_id
            and enrollment.student_id = public.student_id_of()
            and enrollment.status = 'active'
            and offering.status = 'active'
        )
      )
    )
  );

drop policy if exists "class schedules admin write" on public.class_schedules;
create policy "class schedules admin write" on public.class_schedules
  for all
  using (public.is_admin())
  with check (public.is_admin());
