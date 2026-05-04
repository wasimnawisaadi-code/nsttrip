-- Deactivate old generic UAE Visa template
UPDATE public.dsr_templates SET is_active = false WHERE template_key = 'uae_visa';

-- Add UAE Visa (By Bus)
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
  {"key":"ticket_vs","label":"Ticket VS","type":"number"},
  {"key":"oman_visa_quoted","label":"Oman Visa Quoted","type":"number"},
  {"key":"oman_visa_payable","label":"Oman Visa Payable","type":"number"},
  {"key":"oman_vs","label":"Oman VS","type":"number"},
  {"key":"bus_profit","label":"Bus Profit","type":"number"},
  {"key":"uae_visa_quoted","label":"UAE Visa Quoted","type":"number"},
  {"key":"uae_visa_payable","label":"UAE Visa Payable","type":"number"},
  {"key":"visa_profit","label":"Visa Profit","type":"number"},
  {"key":"total_package","label":"Total Package","type":"number","financial":"sale"},
  {"key":"total_profit","label":"Total Profit","type":"number","financial":"profit"},
  {"key":"ticket_type","label":"Ticket Type","type":"text"},
  {"key":"exit_date","label":"Exit Date","type":"date"},
  {"key":"pickup_location","label":"Pick up Location","type":"text"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb);

-- Add UAE Visa (By Air)
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns) VALUES
('uae_visa_air', 'UAE Visa (By Air)', '✈️', 'UAE Visa bookings via Air', '[
  {"key":"sn","label":"SN","type":"text"},
  {"key":"booking_date","label":"Booking Date","type":"date"},
  {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
  {"key":"passport_no","label":"Passport No","type":"text"},
  {"key":"nationality","label":"Nationality","type":"text"},
  {"key":"agency_name","label":"Agency Name","type":"text"},
  {"key":"service","label":"Service","type":"text"},
  {"key":"quoted","label":"Quoted","type":"number"},
  {"key":"payable","label":"Payable","type":"number"},
  {"key":"profit","label":"Profit","type":"number"},
  {"key":"uae_visa_price","label":"UAE Visa","type":"number"},
  {"key":"total_amount","label":"Total","type":"number","financial":"sale"},
  {"key":"total_profit","label":"Total Profit","type":"number","financial":"profit"},
  {"key":"ticket_id","label":"Ticket ID","type":"text"},
  {"key":"vs","label":"VS","type":"number"},
  {"key":"exit_date","label":"Exit Date","type":"date"},
  {"key":"return_date","label":"Return Date","type":"date"},
  {"key":"oman_visa","label":"Oman Visa","type":"number"},
  {"key":"pickup_location","label":"Pick up Location","type":"text"},
  {"key":"remarks","label":"Remarks","type":"textarea"}
]'::jsonb);
