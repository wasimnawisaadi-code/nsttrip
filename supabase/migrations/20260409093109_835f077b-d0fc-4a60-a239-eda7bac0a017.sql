
-- Geofence zones table
CREATE TABLE public.geofence_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius integer NOT NULL DEFAULT 100,
  zone_type text NOT NULL DEFAULT 'office',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage zones" ON public.geofence_zones
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "All authenticated can view active zones" ON public.geofence_zones
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TRIGGER update_geofence_zones_updated_at
  BEFORE UPDATE ON public.geofence_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add location columns to attendance
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS login_lat double precision,
  ADD COLUMN IF NOT EXISTS login_lng double precision,
  ADD COLUMN IF NOT EXISTS logout_lat double precision,
  ADD COLUMN IF NOT EXISTS logout_lng double precision,
  ADD COLUMN IF NOT EXISTS login_location_status text DEFAULT 'unknown';

-- Add zone assignment to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_zone_id uuid REFERENCES public.geofence_zones(id) ON DELETE SET NULL;
