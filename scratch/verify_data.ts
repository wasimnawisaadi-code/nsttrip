
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: dsr } = await supabase.from('dsr_entries')
    .select('sale_amount, profit_amount, entry_date')
    .gte('entry_date', '2026-05-01')
    .lte('entry_date', '2026-05-31');

  const totalSale = dsr.reduce((acc, curr) => acc + Number(curr.sale_amount || 0), 0);
  const totalProfit = dsr.reduce((acc, curr) => acc + Number(curr.profit_amount || 0), 0);

  console.log('--- DATABASE TRUTH (May 2026) ---');
  console.log('Total Sale:', totalSale);
  console.log('Total Profit:', totalProfit);
  console.log('Total Entries:', dsr.length);
}

check();
