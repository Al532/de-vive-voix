create table public.dvv_folders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  unique (owner, id)
);
create unique index dvv_folders_owner_name on public.dvv_folders (owner, lower(trim(name)));

create table public.dvv_scores (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  title text not null,
  composer text not null default '',
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  primary key (owner, id)
);

create table public.dvv_catalogue (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  title text not null,
  composer text not null default '',
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$')
);

create table public.dvv_locations (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  score_id text not null check (score_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  folder_id uuid not null,
  primary key (owner, score_id),
  foreign key (owner, folder_id) references public.dvv_folders (owner, id) on delete cascade
);

alter table public.dvv_folders enable row level security;
alter table public.dvv_scores enable row level security;
alter table public.dvv_catalogue enable row level security;
alter table public.dvv_locations enable row level security;

revoke all on public.dvv_folders, public.dvv_scores, public.dvv_catalogue, public.dvv_locations from anon, authenticated;
grant select, insert, update, delete on public.dvv_folders, public.dvv_locations to authenticated;
grant select, insert on public.dvv_scores to authenticated;
grant select on public.dvv_catalogue to authenticated;
grant select, insert, update, delete on public.dvv_catalogue to service_role;

create policy dvv_folders_owner on public.dvv_folders for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy dvv_locations_owner on public.dvv_locations for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy dvv_scores_owner_read on public.dvv_scores for select to authenticated using (owner = (select auth.uid()));
create policy dvv_scores_owner_insert on public.dvv_scores for insert to authenticated with check (owner = (select auth.uid()));
create policy dvv_catalogue_read on public.dvv_catalogue for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dvv-library', 'dvv-library', false, 20971520, array['application/json', 'application/octet-stream', 'audio/wav']);

create policy dvv_read_objects on storage.objects for select to authenticated using (
  bucket_id = 'dvv-library' and (storage.foldername(name))[1] in ((select auth.uid())::text, 'catalogue')
);
create policy dvv_create_objects on storage.objects for insert to authenticated with check (
  bucket_id = 'dvv-library' and (storage.foldername(name))[1] = (select auth.uid())::text
);
