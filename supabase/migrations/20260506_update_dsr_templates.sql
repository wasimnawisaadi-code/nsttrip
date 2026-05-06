-- Update DSR Templates for Air Ticket and UAE Visa
-- This migration updates the 'columns' JSONB to match the exact requirement

-- 1. Update Air Ticket DSR
UPDATE public.dsr_templates
SET columns = '[
  {"key":"si_no","label":"SI/NO","type":"text"},
  {"key":"issue_date","label":"Issue Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"flight_no","label":"Flight No","type":"text"},
  {"key":"sector","label":"Sector","type":"text"},
  {"key":"travel_date","label":"Travel Date","type":"date"},
  {"key":"pnr","label":"PNR","type":"text"},
  {"key":"ticket_no","label":"Ticket No","type":"text"},
  {"key":"issued_for","label":"Issued for","type":"text"},
  {"key":"fare","label":"Fare","type":"number","financial":"cost"},
  {"key":"sold","label":"Sold","type":"number","financial":"sale"},
  {"key":"profit","label":"Profit","type":"number","financial":"profit"},
  {"key":"supplier","label":"Supplier","type":"text"},
  {"key":"staff","label":"Staff","type":"text"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb,
updated_at = now()
WHERE template_key = 'air_ticket';

-- 2. Update UAE Visa DSR
UPDATE public.dsr_templates
SET columns = '[
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
]'::jsonb,
updated_at = now()
WHERE template_key = 'uae_visa';
