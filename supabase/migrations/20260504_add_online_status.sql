-- Add last_seen_at to profiles for real-time online status tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Update the column whenever the user interacts with the app
COMMENT ON COLUMN public.profiles.last_seen_at IS 'Tracks the last time the user was active in the CRM to determine online status.';
