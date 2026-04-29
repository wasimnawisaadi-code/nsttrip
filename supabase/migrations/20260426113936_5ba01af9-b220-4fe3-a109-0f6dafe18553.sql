-- 1. Create chat-media storage bucket (public so urls render in <audio>/<a>)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for chat-media
CREATE POLICY "Authenticated can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Anyone can read chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Authenticated can delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND owner = auth.uid());

-- 3. Add attachment fields to chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_duration integer;

-- 4. Allow empty text when there's an attachment
ALTER TABLE public.chat_messages
  ALTER COLUMN text DROP NOT NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN text SET DEFAULT '';