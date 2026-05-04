-- Cleanup: Remove previous attempts to avoid duplicates
DELETE FROM public.dsr_templates WHERE template_key IN ('uae_visa_bus', 'uae_visa_air');

-- Add UAE Visa (By Bus) - EXACT COLUMNS
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns) VALUES
('uae_visa_bus', 'UAE Visa (By Bus)', '🚌', 'UAE Visa bookings via Bus / Package', '[
  {"key":"sn","label":"SN","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"agency_name","label":"Agency Name","type":"text"},
  {"key":"service","label":"Service","type":"text"},
  {"key":"ticket_quoted","label":"Ticket Quoted","type":"number"},
  {"key":"ticket_payable","label":"Ticket Payable","type":"number"},
  {"key":"oman_visa_quoted","label":"Oman Visa Quoted","type":"number"},
  {"key":"oman_visa_payable","label":"Oman Visa Payable","type":"number"},
  {"key":"bus_profit","label":"Bus Profit","type":"number"},
  {"key":"uae_visa_quoted","label":"UAE Visa Quoted","type":"number"},
  {"key":"uae_visa_payable","label":"UAE Visa Payable","type":"number"},
  {"key":"visa_profit","label":"Visa Profit","type":"number"},
  {"key":"total_package","label":"Total Package","type":"number","financial":"sale"},
  {"key":"total_profit","label":"Total Profit","type":"number","financial":"profit"}
]'::jsonb);

-- Add UAE Visa (By Air) - EXACT COLUMNS
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns) VALUES
('uae_visa_air', 'UAE Visa (By Air)', '✈️', 'UAE Visa bookings via Air', '[
  {"key":"sn","label":"SN","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"agency_name","label":"Agency Name","type":"text"},
  {"key":"service","label":"Service","type":"text"},
  {"key":"ticket_quoted","label":"Ticket Quoted","type":"number"},
  {"key":"ticket_payable","label":"Ticket Payable","type":"number"},
  {"key":"airline","label":"Airline","type":"text"},
  {"key":"uae_visa_quoted","label":"UAE Visa Quoted","type":"number"},
  {"key":"uae_visa_payable","label":"UAE Visa Payable","type":"number"},
  {"key":"visa_profit","label":"Visa Profit","type":"number"},
  {"key":"total_package","label":"Total Package","type":"number","financial":"sale"},
  {"key":"total_profit","label":"Total Profit","type":"number","financial":"profit"}
]'::jsonb);
