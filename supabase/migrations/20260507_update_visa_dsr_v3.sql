-- Refine UAE Visa DSR Template to a specific 19-column structure in a precise order
-- This migration updates the 'columns' JSONB for 'uae_visa'

UPDATE public.dsr_templates
SET columns = '[
  {"key":"visa_id","label":"Visa ID","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"application_status","label":"Application Status","type":"select","options":["Submitted","Approved","Rejected","Pending"]},
  {"key":"visa_type","label":"Visa Type","type":"text"},
  {"key":"duration","label":"Duration","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"agency_client","label":"Agency / Client","type":"text"},
  {"key":"visa_sale","label":"Visa Sale","type":"number","financial":"sale"},
  {"key":"supplier","label":"Supplier (GDRFA / Agent)","type":"text"},
  {"key":"visa_cost","label":"Visa Cost","type":"number","financial":"cost"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"contact_no","label":"Contact No","type":"text"},
  {"key":"sales_executive","label":"Sales Executive","type":"text"},
  {"key":"payment_status","label":"Payment Status","type":"select","options":["Paid","Pending","Partial"]},
  {"key":"issue_date","label":"Issue Date","type":"date"},
  {"key":"expiry_date","label":"Expiry Date","type":"date"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb,
updated_at = now()
WHERE template_key = 'uae_visa';
