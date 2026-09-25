-- AttendIQ Phase 6-8 foundation: leave decisions, notifications, and live
-- attendance summaries. Existing rows are preserved and remain valid.

alter table public.leaves
  add column if not exists review_comment text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null;

alter table public.leaves
  drop constraint if exists leaves_status_check;
alter table public.leaves
  add constraint leaves_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  related_table text,
  related_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Keep server-side validation authoritative for leave dates and overlap.
create or replace function public.validate_leave_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.to_date < new.from_date then
    raise exception using errcode = '22023', message = 'The to date cannot be before the from date.';
  end if;
  if new.status = 'cancelled' then
    new.cancelled_at = coalesce(new.cancelled_at, now());
    new.cancelled_by = coalesce(new.cancelled_by, auth.uid());
  else
    new.cancelled_at = null;
    new.cancelled_by = null;
  end if;
  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leaves existing
    where existing.student_id = new.student_id
      and existing.id <> new.id
      and existing.status in ('pending', 'approved')
      and existing.from_date <= new.to_date
      and existing.to_date >= new.from_date
  ) then
    raise exception using errcode = '23505', message = 'This leave overlaps an existing pending or approved request.';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at = null;
      new.reviewed_by = null;
      new.review_comment = null;
    elsif new.status in ('approved', 'rejected') then
      new.reviewed_at = now();
      new.reviewed_by = auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "validate leave requests" on public.leaves;
create trigger "validate leave requests" before insert or update on public.leaves
  for each row execute function public.validate_leave_request();

alter table public.notifications enable row level security;
drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "notifications own insert" on public.notifications;
create policy "notifications own insert" on public.notifications
  for insert with check (user_id = auth.uid() or public.is_admin());

-- Direct staff updates are denied. Decisions go through review_leave_request.
drop policy if exists "leaves staff update" on public.leaves;
create policy "leaves staff update" on public.leaves
  for update using (false) with check (false);

-- Student cancellation is also RPC-only so a browser update cannot alter
-- other leave fields alongside status.
drop policy if exists "leaves own cancel" on public.leaves;

-- Create a notification for the student whenever staff makes a decision.
create or replace function public.notify_leave_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'cancelled') then
    insert into public.notifications (user_id, notification_type, title, message, related_table, related_id)
    select student.profile_id, 'leave_' || new.status,
      case new.status when 'approved' then 'Leave request approved' when 'rejected' then 'Leave request rejected' else 'Leave request cancelled' end,
      case new.status when 'approved' then 'Your leave request was approved.' when 'rejected' then 'Your leave request was rejected.' else 'Your leave request was cancelled.' end,
      'leaves', new.id::text
    from public.students student where student.id = new.student_id and student.profile_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists "notify leave decision" on public.leaves;
create trigger "notify leave decision" after update on public.leaves
  for each row execute function public.notify_leave_decision();

revoke all on function public.validate_leave_request() from public, anon;
grant execute on function public.validate_leave_request() to authenticated;
revoke all on function public.notify_leave_decision() from public, anon;
grant execute on function public.notify_leave_decision() to authenticated;

-- Staff decisions are limited to status and a review note. Authorization is
-- checked against the assigned student relationship, not trusted from input.
create or replace function public.review_leave_request(
  p_leave_id bigint, p_status text, p_comment text
) returns public.leaves language plpgsql security definer set search_path = public as $$
declare updated_leave public.leaves;
begin
  if not (public.is_admin() or (public.role_of() = 'teacher' and public.teacher_can_access_student((select student_id from public.leaves where id = p_leave_id)))) then
    raise exception using errcode = '42501', message = 'You are not assigned to review this leave request.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Choose pending, approved, or rejected.';
  end if;
  update public.leaves set status = p_status, reviewed_by = case when p_status = 'pending' then null else auth.uid() end, reviewed_at = case when p_status = 'pending' then null else now() end, review_comment = case when p_status = 'pending' then null else nullif(btrim(p_comment), '') end where id = p_leave_id returning * into updated_leave;
  if not found then raise exception using errcode = 'P0002', message = 'Leave request not found.'; end if;
  return updated_leave;
end;
$$;

create or replace function public.cancel_leave_request(p_leave_id bigint)
returns public.leaves language plpgsql security definer set search_path = public as $$
declare cancelled_leave public.leaves;
begin
  update public.leaves set status = 'cancelled' where id = p_leave_id and student_id = public.student_id_of() and status = 'pending' returning * into cancelled_leave;
  if not found then raise exception using errcode = 'P0002', message = 'Only your pending leave request can be cancelled.'; end if;
  return cancelled_leave;
end;
$$;

revoke all on function public.review_leave_request(bigint, text, text) from public, anon;
grant execute on function public.review_leave_request(bigint, text, text) to authenticated;
revoke all on function public.cancel_leave_request(bigint) from public, anon;
grant execute on function public.cancel_leave_request(bigint) to authenticated;
