
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://iptcmenyayszbftwfhoz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwdGNtZW55YXlzemJmdHdmaG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njg0ODIsImV4cCI6MjA5MzA0NDQ4Mn0.p8KEeYVNqDq6Uk5wO1KEhaXrfssJIdBoAxnFEz6y_Bo";

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyData() {
  console.log('Checking Clients...');
  const { data: clients, error: cerr } = await supabase.from('clients').select('*').limit(10);
  if (cerr) console.error('Clients Error:', cerr);
  else console.log('Clients count:', clients.length);

  console.log('Checking DSR...');
  const { data: dsr, error: derr } = await supabase.from('dsr_entries').select('*').limit(10);
  if (derr) console.error('DSR Error:', derr);
  else console.log('DSR count:', dsr.length);
  
  if (dsr && dsr.length > 0) {
      console.log('DSR Data sample:', dsr[0]);
  }
}

verifyData();
