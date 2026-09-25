-- AttendIQ Phase 6-8 RLS correction. The previous migration was already
-- applied to the hosted project; this follow-up removes the old direct-update
-- policies and keeps all leave decisions on the server RPCs.

drop policy if exists "leaves staff update" on public.leaves;
create policy "leaves staff update" on public.leaves
  for update using (false) with check (false);

drop policy if exists "leaves own cancel" on public.leaves;
