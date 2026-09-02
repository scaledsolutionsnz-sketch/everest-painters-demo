-- ===========================================================================
-- Artifex Decor website CMS
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run.
-- ===========================================================================

-- ------------------------------------------------------------------ content
create table if not exists public.site_content (
  key         text primary key,
  data        jsonb       not null default '{}'::jsonb,
  type        text        not null default 'text',
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) on delete set null
);

comment on table public.site_content is
  'One row per editable element on the website. key matches the data-cms '
  'attribute in the HTML; data holds {v, href} for text or {src, alt} for images.';

create or replace function public.site_content_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch
  before insert or update on public.site_content
  for each row execute function public.site_content_touch();

alter table public.site_content enable row level security;

-- Anyone (including anonymous visitors) may read: this is public website copy.
drop policy if exists "site_content read" on public.site_content;
create policy "site_content read"
  on public.site_content for select
  using (true);

-- Only a signed-in admin may change it.
drop policy if exists "site_content write" on public.site_content;
create policy "site_content write"
  on public.site_content for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------------- images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images', 'site-images', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site images read" on storage.objects;
create policy "site images read"
  on storage.objects for select
  using (bucket_id = 'site-images');

drop policy if exists "site images insert" on storage.objects;
create policy "site images insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-images');

drop policy if exists "site images update" on storage.objects;
create policy "site images update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-images')
  with check (bucket_id = 'site-images');

drop policy if exists "site images delete" on storage.objects;
create policy "site images delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-images');
