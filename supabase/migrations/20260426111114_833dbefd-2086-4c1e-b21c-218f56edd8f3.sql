
-- DSR Templates
CREATE TABLE public.dsr_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  description TEXT,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dsr_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active templates"
  ON public.dsr_templates FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage templates"
  ON public.dsr_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- DSR Assignments
CREATE TABLE public.dsr_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.dsr_templates(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, employee_id)
);

ALTER TABLE public.dsr_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage assignments"
  ON public.dsr_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees see own assignments"
  ON public.dsr_assignments FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- DSR Entries
CREATE TABLE public.dsr_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.dsr_templates(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  employee_id UUID NOT NULL,
  employee_name TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sale_amount NUMERIC DEFAULT 0,
  cost_amount NUMERIC DEFAULT 0,
  profit_amount NUMERIC DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dsr_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins access all entries"
  ON public.dsr_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees see own entries"
  ON public.dsr_entries FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Employees create own entries"
  ON public.dsr_entries FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees update own entries"
  ON public.dsr_entries FOR UPDATE TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Employees delete own entries"
  ON public.dsr_entries FOR DELETE TO authenticated
  USING (employee_id = auth.uid());

CREATE INDEX idx_dsr_entries_employee_date ON public.dsr_entries(employee_id, entry_date DESC);
CREATE INDEX idx_dsr_entries_template_date ON public.dsr_entries(template_id, entry_date DESC);

CREATE TRIGGER trg_dsr_templates_updated BEFORE UPDATE ON public.dsr_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dsr_entries_updated BEFORE UPDATE ON public.dsr_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the 5 templates
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns) VALUES
('air_ticket', 'Air Ticket DSR', '✈️', 'Daily air ticket bookings', '[
  {"key":"ticket_id","label":"Ticket ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"travel_date","label":"Travel Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"airline","label":"Airline","type":"text"},
  {"key":"route","label":"Route","type":"text"},
  {"key":"ticket_type","label":"Ticket Type","type":"text"},
  {"key":"pnr","label":"PNR","type":"text"},
  {"key":"supplier","label":"Supplier","type":"text"},
  {"key":"ticket_sale","label":"Ticket Sale","type":"number","financial":"sale"},
  {"key":"ticket_cost","label":"Ticket Cost","type":"number","financial":"cost"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"ticket_status","label":"Ticket Status","type":"select","options":["Confirmed","Pending","Cancelled","Refunded"]},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb),
('uae_visa', 'UAE Visa DSR', '🇦🇪', 'UAE visa applications', '[
  {"key":"visa_id","label":"Visa ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"visa_type","label":"Visa Type","type":"text"},
  {"key":"duration","label":"Duration","type":"text"},
  {"key":"supplier","label":"Supplier (GDRFA / Agent)","type":"text"},
  {"key":"visa_sale","label":"Visa Sale","type":"number","financial":"sale"},
  {"key":"visa_cost","label":"Visa Cost","type":"number","financial":"cost"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"application_status","label":"Application Status","type":"select","options":["Submitted","Approved","Rejected","Pending"]},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"issue_date","label":"Issue Date","type":"date"},
  {"key":"expiry_date","label":"Expiry Date","type":"date"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb),
('global_visa', 'Global Visa DSR', '🌍', 'International visa applications', '[
  {"key":"visa_id","label":"Visa ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"country","label":"Country","type":"text"},
  {"key":"visa_type","label":"Visa Type","type":"text"},
  {"key":"processing_type","label":"Processing Type","type":"select","options":["Normal","Express"]},
  {"key":"supplier","label":"Supplier","type":"text"},
  {"key":"visa_sale","label":"Visa Sale","type":"number","financial":"sale"},
  {"key":"visa_cost","label":"Visa Cost","type":"number","financial":"cost"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"status","label":"Status","type":"select","options":["Submitted","Approved","Rejected","Pending"]},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"submission_date","label":"Submission Date","type":"date"},
  {"key":"approval_date","label":"Approval Date","type":"date"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb),
('uae_tours', 'UAE Tours DSR', '🏜️', 'UAE tour packages', '[
  {"key":"service_id","label":"Service ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"service_date","label":"Service Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"tour_type","label":"Tour Type","type":"text"},
  {"key":"package_name","label":"Package Name","type":"text"},
  {"key":"supplier","label":"Supplier","type":"text"},
  {"key":"cost","label":"Cost","type":"number","financial":"cost"},
  {"key":"sale","label":"Sale","type":"number","financial":"sale"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"pickup_location","label":"Pickup Location","type":"text"},
  {"key":"drop_location","label":"Drop Location","type":"text"},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"service_status","label":"Service Status","type":"select","options":["Confirmed","Pending","Completed","Cancelled"]},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb),
('global_tours', 'Global Tours DSR', '🌐', 'International tour packages', '[
  {"key":"service_id","label":"Service ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"travel_date","label":"Travel Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"country","label":"Country","type":"text"},
  {"key":"package_name","label":"Package Name","type":"text"},
  {"key":"duration","label":"Duration","type":"text"},
  {"key":"supplier","label":"Supplier","type":"text"},
  {"key":"cost","label":"Cost","type":"number","financial":"cost"},
  {"key":"sale","label":"Sale","type":"number","financial":"sale"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"travel_status","label":"Travel Status","type":"select","options":["Confirmed","Pending","Completed","Cancelled"]},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb);
