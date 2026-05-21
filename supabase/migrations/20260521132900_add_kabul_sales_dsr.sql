-- Migration to add Kabul Sales DSR Template
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns)
VALUES (
  'kabul_sales', 
  'Kabul Sales Report', 
  '📊', 
  'Daily sales report for flights to/from Kabul', 
  '[
    {"key":"s_no","label":"S.NO","type":"text"},
    {"key":"passenger_name","label":"Passenger Name","type":"text","required":true},
    {"key":"flight_no","label":"Flight No","type":"text"},
    {"key":"sector","label":"Sector","type":"text"},
    {"key":"travel_date","label":"Travel Date","type":"date"},
    {"key":"pnr","label":"PNR","type":"text"},
    {"key":"client","label":"CLIENT","type":"text"},
    {"key":"fare","label":"Fare","type":"number","financial":"cost"},
    {"key":"sold","label":"Sold","type":"number","financial":"sale"},
    {"key":"profit","label":"Profit","type":"number","financial":"profit"},
    {"key":"supplier","label":"Supplier","type":"text"},
    {"key":"book_in","label":"BOOK IN","type":"text"},
    {"key":"staff","label":"Staff","type":"text"},
    {"key":"remarks","label":"Remarks","type":"textarea"}
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET 
  columns = EXCLUDED.columns, 
  name = EXCLUDED.name, 
  description = EXCLUDED.description;
