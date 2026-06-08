
const url = "https://iptcmenyayszbftwfhoz.supabase.co/rest/v1/dsr_templates";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwdGNtZW55YXlzemJmdHdmaG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njg0ODIsImV4cCI6MjA5MzA0NDQ4Mn0.p8KEeYVNqDq6Uk5wO1KEhaXrfssJIdBoAxnFEz6y_Bo";

const template = {
  template_key: 'group_sheets',
  name: 'Group Sheets',
  icon: '📋',
  description: 'Group flight bookings and sheets',
  columns: [
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
  ],
  is_active: true
};

async function addTemplate() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(template)
    });
    
    if (res.ok) {
      console.log("Template 'Group Sheets' added successfully!");
    } else {
      const err = await res.text();
      console.error("Failed to add template:", err);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

addTemplate();
