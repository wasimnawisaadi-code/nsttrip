DROP POLICY IF EXISTS "Service role can insert leads" ON public.social_leads;
-- Service role bypasses RLS, so no policy is needed for the edge function.
-- Block manual client-side inserts entirely.