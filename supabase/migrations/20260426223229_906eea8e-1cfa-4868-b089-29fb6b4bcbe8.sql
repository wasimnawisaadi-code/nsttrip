
-- ============== IMPORTANT DATES: tick-in/out (silence reminders) ==============
CREATE TABLE IF NOT EXISTS public.date_reminder_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date_label TEXT NOT NULL,
  silenced BOOLEAN NOT NULL DEFAULT false,
  last_reminder_sent_at TIMESTAMPTZ,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, date_label)
);
ALTER TABLE public.date_reminder_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all date prefs"
  ON public.date_reminder_prefs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees manage prefs for own clients"
  ON public.date_reminder_prefs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = date_reminder_prefs.client_id
      AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = date_reminder_prefs.client_id
      AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())
  ));

-- ============== SOCIAL MEDIA LEADS CRM ==============
CREATE TABLE IF NOT EXISTS public.social_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('whatsapp','instagram','messenger')),
  unique_key TEXT NOT NULL,           -- normalized id used for dedup
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT,
  username TEXT,
  page_id TEXT,
  language TEXT,
  gender TEXT,
  timezone TEXT,
  subscribed BOOLEAN DEFAULT true,
  opted_in BOOLEAN DEFAULT true,
  last_interaction TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  messaging_window TEXT,
  raw JSONB DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CONVERTED','NOT_CONVERTED')),
  assigned_to UUID,                   -- nullable until "Take Lead"
  assigned_at TIMESTAMPTZ,
  client_need TEXT,
  notes TEXT,
  follow_up_date DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, unique_key)
);

ALTER TABLE public.social_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view all leads"
  ON public.social_leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage all leads"
  ON public.social_leads FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees can take unassigned leads"
  ON public.social_leads FOR UPDATE TO authenticated
  USING (assigned_to IS NULL OR assigned_to = auth.uid());

CREATE POLICY "Service role can insert leads"
  ON public.social_leads FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.social_leads(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view all lead notes"
  ON public.lead_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can add lead notes"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Admins can manage all notes"
  ON public.lead_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_social_leads_source_status ON public.social_leads(source, status);
CREATE INDEX IF NOT EXISTS idx_social_leads_assigned ON public.social_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes(lead_id);

CREATE TRIGGER update_social_leads_updated_at
  BEFORE UPDATE ON public.social_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== PAYROLL: ensure manual entries description column exists (already does) ==============
-- payroll_entries already has entry_type/description/amount, no change needed.

-- ============== ENABLE EXTENSIONS for cron-based reminders ==============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
