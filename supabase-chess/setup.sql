-- NEXA Chess V7 - Supabase Realtime private Broadcast policies
-- Run this in Supabase SQL Editor.
-- IMPORTANT: realtime.messages already has RLS enabled by Supabase.
-- Do NOT run ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY.

DROP POLICY IF EXISTS "nexa chess receive broadcast" ON realtime.messages;
DROP POLICY IF EXISTS "nexa chess send broadcast" ON realtime.messages;

CREATE POLICY "nexa chess receive broadcast"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) LIKE 'nexa-chess-%'
  AND COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'nexa_bot'),
    ''
  ) <> ''
);

CREATE POLICY "nexa chess send broadcast"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) LIKE 'nexa-chess-%'
  AND COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'nexa_bot'),
    ''
  ) <> ''
);
