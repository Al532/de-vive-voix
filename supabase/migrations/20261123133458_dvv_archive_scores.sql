alter table public.dvv_scores
  add column deleted_at timestamptz;
alter table public.dvv_catalogue
  add column deleted_at timestamptz;

grant update (deleted_at) on public.dvv_scores, public.dvv_catalogue to authenticated;

create policy dvv_scores_members_archive on public.dvv_scores for update to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
create policy dvv_catalogue_members_archive on public.dvv_catalogue for update to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
