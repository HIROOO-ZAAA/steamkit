-- supabase/migrations/20261017000004_voice_voicestudio_backend.sql
--
-- Swaps voice_clones from referencing an ElevenLabs voice_id to a
-- VoiceStudio-local voice_id. Written defensively since the column name on
-- your actual table wasn't confirmed (you hit `elevenlabs_voice_id does not
-- exist` earlier, meaning the real column has a different name) — check
-- this against `\d voice_clones` before running, and adjust the source
-- column name in step 1 if it isn't elevenlabs_voice_id.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'voice_clones' and column_name = 'elevenlabs_voice_id'
  ) then
    alter table voice_clones rename column elevenlabs_voice_id to voicestudio_voice_id;
  elsif not exists (
    select 1 from information_schema.columns
    where table_name = 'voice_clones' and column_name = 'voicestudio_voice_id'
  ) then
    alter table voice_clones add column voicestudio_voice_id text;
  end if;
end $$;

comment on column voice_clones.voicestudio_voice_id is
  'ID of the voice profile inside the self-hosted VoiceStudio instance, not an ElevenLabs voice ID.';

-- ── Private cache bucket for synthesised audio ────────────────────────────────
-- Re-asserts the tts-cache bucket in case this is a fresh database state
-- where the ElevenLabs migration was never applied.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tts-cache', 'tts-cache', false, 5000000)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
