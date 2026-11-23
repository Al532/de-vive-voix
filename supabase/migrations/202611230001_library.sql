create table public.dvv_members (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.dvv_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120)
);
create unique index dvv_folders_name on public.dvv_folders (lower(trim(name)));

create table public.dvv_scores (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_by uuid default auth.uid() references auth.users on delete set null,
  title text not null,
  composer text not null default '',
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$')
);

create table public.dvv_catalogue (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  title text not null,
  composer text not null default '',
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$')
);

create table public.dvv_locations (
  score_id text primary key check (score_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  folder_id uuid not null references public.dvv_folders (id) on delete cascade
);
create index dvv_locations_folder on public.dvv_locations (folder_id);
create index dvv_scores_creator on public.dvv_scores (created_by);

alter table public.dvv_members enable row level security;
alter table public.dvv_folders enable row level security;
alter table public.dvv_scores enable row level security;
alter table public.dvv_catalogue enable row level security;
alter table public.dvv_locations enable row level security;

revoke all on public.dvv_members, public.dvv_folders, public.dvv_scores, public.dvv_catalogue, public.dvv_locations from anon, authenticated;
grant select on public.dvv_members, public.dvv_catalogue to authenticated;
grant select, insert, update, delete on public.dvv_folders, public.dvv_locations to authenticated;
grant select, insert on public.dvv_scores to authenticated;
grant select, insert, update, delete on public.dvv_members, public.dvv_catalogue to service_role;

create policy dvv_read_membership on public.dvv_members for select to authenticated using (user_id = (select auth.uid()));

create policy dvv_folders_members on public.dvv_folders for all to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
create policy dvv_locations_members on public.dvv_locations for all to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))))
  with check ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
create policy dvv_scores_members_read on public.dvv_scores for select to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
create policy dvv_scores_members_insert on public.dvv_scores for insert to authenticated
  with check (created_by = (select auth.uid()) and (select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));
create policy dvv_catalogue_members_read on public.dvv_catalogue for select to authenticated
  using ((select exists (select 1 from public.dvv_members where user_id = (select auth.uid()))));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dvv-library', 'dvv-library', false, 20971520, array['application/json', 'application/octet-stream', 'audio/wav']);

create policy dvv_read_objects on storage.objects for select to authenticated using (
  bucket_id = 'dvv-library'
  and (storage.foldername(name))[1] in ('shared', 'catalogue')
  and (select exists (select 1 from public.dvv_members where user_id = (select auth.uid())))
);
create policy dvv_create_objects on storage.objects for insert to authenticated with check (
  bucket_id = 'dvv-library'
  and (storage.foldername(name))[1] = 'shared'
  and (select exists (select 1 from public.dvv_members where user_id = (select auth.uid())))
);
