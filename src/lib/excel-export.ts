// Tiny shared helper to export tabular data as a real .xlsx file.
import * as XLSX from 'xlsx';

// Columns whose values are phone-like and must be written as TEXT so Excel does
// not turn a long number (e.g. 971565919456) into scientific notation
// (9.71E+11) or strip a leading "+"/zero — the classic "I can't see the number"
// symptom in the downloaded sheet.
const PHONE_HEADER = /phone|mobile|contact|whatsapp|number|tel/i;

export function exportToExcel(rows: Array<Record<string, unknown>>, filenameNoExt: string, sheetName = 'Sheet1') {
  if (!rows || rows.length === 0) return;

  // Collect the full set of columns across ALL rows (not just rows[0]) so no
  // column is dropped just because the first record happened to omit a field.
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
  }

  // Build an array-of-arrays so every row is aligned to the same header order.
  const aoa: unknown[][] = [
    headers,
    ...rows.map(r => headers.map(h => {
      const v = (r as any)[h];
      return v == null ? '' : v;
    })),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Force phone-like columns to be stored as text strings, so the digits are
  // preserved exactly and always visible when the file is opened.
  headers.forEach((h, colIdx) => {
    if (!PHONE_HEADER.test(h)) return;
    for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
      const cell = ws[addr];
      if (!cell || cell.v === '' || cell.v == null) continue;
      cell.t = 's';
      cell.v = String(cell.v);
      cell.z = '@'; // text number format
    }
  });

  // Auto-fit column widths roughly.
  ws['!cols'] = headers.map((h, colIdx) => {
    const max = Math.max(
      h.length,
      ...aoa.slice(1).map(row => String(row[colIdx] ?? '').length),
    );
    return { wch: Math.min(60, Math.max(10, max + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filenameNoExt}.xlsx`);
}
