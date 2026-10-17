-- Profile media: creator picture (avatar) and cover (banner).
--
-- Public so the tip page, the Open Graph card and OBS overlays can load them
-- straight from a URL. Writes go through the authenticated dashboard client and
-- are namespaced per user id, so one creator cannot overwrite another's files.
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = true;

-- Signed-in creators may upload their own picture/cover.
drop policy if exists "creators upload own profile media" on storage.objects;
create policy "creators upload own profile media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creators update own profile media" on storage.objects;
create policy "creators update own profile media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creators delete own profile media" on storage.objects;
create policy "creators delete own profile media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Everyone needs to read these (public bucket).
drop policy if exists "profile media public read" on storage.objects;
create policy "profile media public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'profile-media');