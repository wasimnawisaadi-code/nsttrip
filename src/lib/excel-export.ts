// Tiny shared helper to export tabular data as a real .xlsx file.
import * as XLSX from 'xlsx';

export function exportToExcel(rows: Array<Record<string, unknown>>, filenameNoExt: string, sheetName = 'Sheet1') {
  if (!rows || rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-fit column widths roughly
  const headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map(h => {
    const max = Math.max(h.length, ...rows.map(r => String((r as any)[h] ?? '').length));
    return { wch: Math.min(60, Math.max(10, max + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filenameNoExt}.xlsx`);
}
