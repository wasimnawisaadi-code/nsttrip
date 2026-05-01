-- Enable Realtime for the profiles table so we can detect session changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Ensure the table has replication enabled (Full replica identity is safer for session tracking)
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
