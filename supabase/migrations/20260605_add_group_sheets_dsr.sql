-- Migration to add Group Sheets DSR Template
INSERT INTO public.dsr_templates (template_key, name, icon, description, columns, is_active)
VALUES (
  'group_sheets', 
  'Group Sheets', 
  '📋', 
  'Group flight bookings and sheets', 
  '[
    {"key":"s_no","label":"S.NO","type":"text"},
    {"key":"pax_name","label":"PAX NAME","type":"text","required":true},
    {"key":"travel_details","label":"TRAVEL DATE FLIGHT DETAILS","type":"text"},
    {"key":"issue_for","label":"ISSUE FOR","type":"text"},
    {"key":"fare","label":"FARE","type":"number","financial":"cost"},
    {"key":"sell","label":"SELL","type":"number","financial":"sale"},
    {"key":"issue_date","label":"ISSUE DATE","type":"date"},
    {"key":"pnr","label":"PNR","type":"text"},
    {"key":"time_limit","label":"TIME LIMIT","type":"text"},
    {"key":"dep_time","label":"DEP TIME","type":"text"},
    {"key":"arr_time","label":"ARR TIME","type":"text"},
    {"key":"issued_by","label":"ISSUED BY","type":"text"},
    {"key":"remarks","label":"REMARKS","type":"textarea"}
  ]'::jsonb,
  true
) ON CONFLICT (template_key) DO UPDATE SET 
  columns = EXCLUDED.columns, 
  name = EXCLUDED.name, 
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
