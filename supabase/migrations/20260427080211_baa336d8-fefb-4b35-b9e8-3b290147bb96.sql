
-- Add proof_url to social_leads
ALTER TABLE public.social_leads
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Create storage bucket for lead conversion proofs (public read for simplicity)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-proofs', 'lead-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Anyone can view lead proofs" ON storage.objects;
CREATE POLICY "Anyone can view lead proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-proofs');

DROP POLICY IF EXISTS "Authenticated can upload lead proofs" ON storage.objects;
CREATE POLICY "Authenticated can upload lead proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lead-proofs');

DROP POLICY IF EXISTS "Authenticated can update lead proofs" ON storage.objects;
CREATE POLICY "Authenticated can update lead proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lead-proofs');

DROP POLICY IF EXISTS "Authenticated can delete lead proofs" ON storage.objects;
CREATE POLICY "Authenticated can delete lead proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lead-proofs');
