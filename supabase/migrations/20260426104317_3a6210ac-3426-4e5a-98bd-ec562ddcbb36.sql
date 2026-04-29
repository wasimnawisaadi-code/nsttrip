
-- App-wide settings (key/value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default attendance settings
INSERT INTO public.app_settings (key, value)
VALUES ('attendance', '{"work_start":"09:00","grace_minutes":15,"weekend_days":[5,6]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Payroll lock flag
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT;
