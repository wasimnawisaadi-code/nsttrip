
/**
 * Nawi Travel CRM - Unified Accounting Logic
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL FINANCIAL CALCULATIONS.
 */

export interface FinancialStats {
  revenue: number;
  cost: number;
  profit: number;
  count: number;
}

/**
 * Standardizes calculation of Revenue, Cost, and Profit from DSR entries or Client records.
 * Ensures that numeric casting is applied to prevent string concatenation.
 */
export function calculateFinancials(items: any[] | null | undefined): FinancialStats {
  if (!items || !Array.isArray(items)) {
    return { revenue: 0, cost: 0, profit: 0, count: 0 };
  }
  return items.reduce((acc, item) => {
    if (!item) return acc;
    const rev = Number(item.revenue || item.sale_amount || 0);
    const cost = Number(item.cost_amount || 0);
    const prof = Number(item.profit || item.profit_amount || 0);

    return {
      revenue: acc.revenue + rev,
      cost: acc.cost + cost,
      profit: acc.profit + prof,
      count: acc.count + 1
    };
  }, { revenue: 0, cost: 0, profit: 0, count: 0 });
}

/**
 * Common date range generator for 'This Month' or specific YYYY-MM.
 * Ensures the entire month (1st to last day) is covered.
 */
export function getMonthRange(yearMonth: string | null | undefined) {
  if (!yearMonth || !yearMonth.includes('-')) {
    const now = new Date().toISOString().split('T')[0].slice(0, 7);
    const [y, m] = now.split('-').map(Number);
    return { start: `${now}-01`, end: new Date(y, m, 0).toISOString().split('T')[0] };
  }
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const end = new Date(y, m, 0).toISOString().split('T')[0];
  return { start, end };
}
