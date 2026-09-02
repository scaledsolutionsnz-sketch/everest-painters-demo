-- ===========================================================================
-- Everest Painters website CMS  (everestpainters.co.nz)
--
-- Runs in Supabase project bffddgypusotsdwpaliy.
--
-- Everything is namespaced with an `everest_` prefix so it cannot collide with
-- anything else already in that project. This matters: an earlier version of
-- this file used a bare `site_content` table, which clashed with an unrelated
-- table of the same name in another project and would have widened its RLS.
--
-- Run once in the Supabase SQL editor. Safe to re-run. Creates nothing that
-- already exists and alters no existing object.
-- ===========================================================================

-- ------------------------------------------------------------------ editors
-- Who may edit the Everest site. Membership here is the ONLY thing that
-- grants write access — being a CRM user, or even a CRM admin, is not enough.
create table if not exists public.everest_site_editors (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  added_at   timestamptz not null default now()
);

alter table public.everest_site_editors enable row level security;

-- Deliberately no policies: the table is readable and writable only by the
-- service role and the SQL editor. Nobody manages this list from the browser.

create or replace function public.is_everest_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.everest_site_editors
    where user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------ content
create table if not exists public.everest_site_content (
  key         text primary key,
  data        jsonb       not null default '{}'::jsonb,
  type        text        not null default 'text',
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) on delete set null
);

comment on table public.everest_site_content is
  'One row per editable element on everestpainters.co.nz. key matches the '
  'data-cms attribute in the HTML; data holds {v, href} for text or '
  '{src, alt} for images.';

create or replace function public.everest_site_content_touch()
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

drop trigger if exists everest_site_content_touch on public.everest_site_content;
create trigger everest_site_content_touch
  before insert or update on public.everest_site_content
  for each row execute function public.everest_site_content_touch();

alter table public.everest_site_content enable row level security;

-- Anyone may read: this is public website copy.
drop policy if exists "everest_site_content read" on public.everest_site_content;
create policy "everest_site_content read"
  on public.everest_site_content for select
  using (true);

-- Only a listed Everest editor may write. Note this is scoped per-command
-- rather than `for all`, so a missing WITH CHECK cannot widen anything.
drop policy if exists "everest_site_content insert" on public.everest_site_content;
create policy "everest_site_content insert"
  on public.everest_site_content for insert
  to authenticated
  with check (public.is_everest_editor());

drop policy if exists "everest_site_content update" on public.everest_site_content;
create policy "everest_site_content update"
  on public.everest_site_content for update
  to authenticated
  using (public.is_everest_editor())
  with check (public.is_everest_editor());

drop policy if exists "everest_site_content delete" on public.everest_site_content;
create policy "everest_site_content delete"
  on public.everest_site_content for delete
  to authenticated
  using (public.is_everest_editor());

-- ------------------------------------------------------------------- images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'everest-site-images', 'everest-site-images', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Every policy below is scoped to bucket_id = 'everest-site-images', so the
-- CRM's own buckets (notice-pdfs, etc.) are unaffected.
drop policy if exists "everest images read" on storage.objects;
create policy "everest images read"
  on storage.objects for select
  using (bucket_id = 'everest-site-images');

drop policy if exists "everest images insert" on storage.objects;
create policy "everest images insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'everest-site-images' and public.is_everest_editor());

drop policy if exists "everest images update" on storage.objects;
create policy "everest images update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'everest-site-images' and public.is_everest_editor())
  with check (bucket_id = 'everest-site-images' and public.is_everest_editor());

drop policy if exists "everest images delete" on storage.objects;
create policy "everest images delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'everest-site-images' and public.is_everest_editor());

-- ===========================================================================
-- AFTER creating the admin user in Authentication -> Users, run this to let
-- them edit (replace the email):
--
--   insert into public.everest_site_editors (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
--
-- To revoke access later, without deleting their account:
--
--   delete from public.everest_site_editors
--   where user_id = (select id from auth.users where email = 'you@example.com');
-- ===========================================================================
