create or replace function public.admin_set_current_semester(p_year integer, p_semester integer)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_year public.academic_years;
  selected_semester public.semesters;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can change the current semester.';
  end if;
  if p_year is null or p_year < 2020 or p_year > 9999
     or p_semester is null or p_semester not between 1 and 8 then
    raise exception using errcode = '22023', message = 'Choose a year from 2020 onward and a semester from 1 to 8.';
  end if;

  update public.semesters set is_current = false where is_current;
  update public.academic_years set is_current = false where is_current;

  insert into public.academic_years (name, start_date, end_date, is_current)
  values (p_year::text, make_date(p_year, 1, 1), make_date(p_year, 12, 31), false)
  on conflict (name) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        is_current = false
  returning * into selected_year;

  for semester_number in 1..8 loop
    insert into public.semesters
      (academic_year_id, name, number, start_date, end_date, is_current)
    values (
      selected_year.id,
      'Semester ' || semester_number,
      semester_number,
      selected_year.start_date,
      selected_year.end_date,
      false
    )
    on conflict (academic_year_id, number) do update
      set name = excluded.name,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          is_current = false;
  end loop;

  update public.academic_years set is_current = true where id = selected_year.id;
  update public.semesters
  set is_current = (number = p_semester)
  where academic_year_id = selected_year.id;
  select * into selected_semester
  from public.semesters
  where academic_year_id = selected_year.id
    and number = p_semester;

  return selected_semester;
end;
$$;
