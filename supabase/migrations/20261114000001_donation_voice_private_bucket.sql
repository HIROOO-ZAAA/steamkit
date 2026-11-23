-- H-04: Restrict donation voice recordings to authorized signed-URL access.
-- Uploads and playback continue through existing service-role API routes.

UPDATE storage.buckets
SET public = false
WHERE id = 'donation-voice';
