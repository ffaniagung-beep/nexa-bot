-- NEXA Chess V8 - Supabase Realtime private Broadcast authorization
-- Safe to run again: V7 policies are dropped and replaced.
-- Vercel creates a real anonymous Auth session, then adds authorization-only
-- app_metadata with the server-side Supabase secret key.

DROP POLICY IF EXISTS "nexa chess receive broadcast" ON realtime.messages;
DROP POLICY IF EXISTS "nexa chess send broadcast" ON realtime.messages;

CREATE POLICY "nexa chess receive broadcast"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND realtime.topic() LIKE 'nexa-chess-%'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) IS TRUE
  AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'nexa_chess')::boolean, false) IS TRUE
  AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'nexa_bot', '') <> ''
);

CREATE POLICY "nexa chess send broadcast"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND realtime.topic() LIKE 'nexa-chess-%'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) IS TRUE
  AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'nexa_chess')::boolean, false) IS TRUE
  AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'nexa_bot', '') <> ''
);
