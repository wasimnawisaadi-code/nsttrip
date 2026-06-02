import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDsrData() {
    const startOfMonth = '2026-06-01';
    const endOfMonth = '2026-06-30';

    const { data, error } = await supabase
        .from('dsr_entries')
        .select('*')
        .gte('entry_date', startOfMonth)
        .lte('entry_date', endOfMonth);

    if (error) {
        console.error('Error fetching DSR entries:', error);
        return;
    }

    console.log(`Found ${data.length} DSR entries for June 2026`);
    
    if (data.length > 0) {
        let totalSales = 0;
        let totalProfit = 0;
        data.forEach(entry => {
            totalSales += Number(entry.sale_amount || 0);
            totalProfit += Number(entry.profit_amount || 0);
        });
        console.log('Total Sales:', totalSales);
        console.log('Total Profit:', totalProfit);
        console.log('Sample Entry Date:', data[0].entry_date);
    }
}

checkDsrData();
