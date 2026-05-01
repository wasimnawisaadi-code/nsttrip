-- Add current_session_id to profiles to track active session for single-device login
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_session_id TEXT;

-- Create an index for faster lookup
CREATE INDEX IF NOT EXISTS idx_profiles_session_id ON public.profiles(current_session_id);

COMMENT ON COLUMN public.profiles.current_session_id IS 'Stores the current active session ID for single-device login enforcement (Employees only).';
