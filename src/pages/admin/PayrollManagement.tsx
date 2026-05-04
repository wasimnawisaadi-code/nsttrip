import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import PayrollEntriesModal from '@/components/PayrollEntriesModal';
import { Download, Calculator, Edit, Save, X, Lock, Unlock, FileText, ListPlus } from 'lucide-react';
import { toast } from 'sonner';
import { getAttendanceSettings } from '@/lib/settings';

const NUMERIC_FIELDS = [
  'base_salary', 'present_days', 'late_days', 'absent_days',
  'paid_leave_days', 'sick_leave', 'unpaid_leave', 'total_hours',
  'sick_deduction', 'unpaid_deduction', 'absence_deduction', 'late_deduction',
  'bonus', 'allowances', 'overtime',
];

function getWorkingDaysInMonth(yearMonth: string, weekendDays: number[] = [0]) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (!weekendDays.includes(day)) count++;
  }
  return count || 22; // fallback
}

export default function PayrollManagement() {
  const { user } = useAuth();
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([0]);
  const [pwdAction, setPwdAction] = useState<{ type: 'lock' | 'unlock' | 'confirm'; row: any } | null>(null);
  const [entriesModal, setEntriesModal] = useState<any | null>(null);
  const [entriesByPayroll, setEntriesByPayroll] = useState<Record<string, { credit: number; debit: number }>>({});

  const monthLocked = payroll.length > 0 && payroll.every(p => p.locked);

  useEffect(() => {
    const fetchEmps = async () => {
      const [empsRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'active'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      // Admins are bosses — exclude from payroll
      const adminIds = new Set((rolesRes.data || []).filter((r: any) => r.role === 'admin' || r.role === 'superadmin').map((r: any) => r.user_id));
      setEmployees((empsRes.data || []).filter((e: any) => !adminIds.has(e.user_id)));
      
      const settings = await getAttendanceSettings();
      setWeekendDays(settings.weekend_days);
    };
    fetchEmps();
  }, []);

  const loadEntries = async (payrollIds: string[]) => {
    if (payrollIds.length === 0) { setEntriesByPayroll({}); return; }
    const { data } = await supabase.from('payroll_entries').select('payroll_id, entry_type, amount').in('payroll_id', payrollIds);
    const credits = new Set(['bonus', 'allowance', 'overtime', 'reimbursement']);
    const map: Record<string, { credit: number; debit: number }> = {};
    (data || []).forEach((e: any) => {
      if (!map[e.payroll_id]) map[e.payroll_id] = { credit: 0, debit: 0 };
      if (credits.has(e.entry_type)) map[e.payroll_id].credit += Number(e.amount || 0);
      else map[e.payroll_id].debit += Number(e.amount || 0);
    });
    setEntriesByPayroll(map);
  };

  const load = async () => {
    const { data } = await supabase.from('payroll').select('*').eq('year_month', yearMonth);
    const rows = data || [];
    setPayroll(rows);
    await loadEntries(rows.map((r: any) => r.id));
  };
  useEffect(() => { load(); }, [yearMonth]);

  const calculatePayroll = async () => {
    const { data: attendance } = await supabase.from('attendance').select('*').gte('date', `${yearMonth}-01`).lte('date', `${yearMonth}-31`);
    const { data: leave } = await supabase.from('leave_requests').select('*').eq('status', 'Approved');
    const allAttendance = attendance || [];
    const allLeave = leave || [];

    for (const emp of employees) {
      const existing = payroll.find(p => p.employee_id === emp.user_id);
      if (existing) continue;

      const monthAtt = allAttendance.filter(a => a.employee_id === emp.user_id);
      const presentDays = monthAtt.filter(a => a.status === 'Present' || a.status === 'Late').length;
      const lateDays = monthAtt.filter(a => a.status === 'Late').length;
      const totalHours = monthAtt.reduce((s, a) => s + (a.hours_worked || 0), 0);

      const monthLeave = allLeave.filter(l => l.employee_id === emp.user_id && l.start_date?.startsWith(yearMonth));
      const paidLeaveDays = monthLeave.filter(l => ['Annual', 'Paternity', 'Bereavement'].includes(l.leave_type || '')).reduce((s, l) => s + (l.days || 0), 0);
      const sickLeave = monthLeave.filter(l => l.leave_type === 'Sick').reduce((s, l) => s + (l.days || 0), 0);
      const unpaidLeave = monthLeave.filter(l => ['Hajj', 'Emergency'].includes(l.leave_type || '')).reduce((s, l) => s + (l.days || 0), 0);

      const baseSalary = emp.base_salary || 0;
      const totalWorkingDays = getWorkingDaysInMonth(yearMonth, weekendDays);
      const dailyRate = baseSalary / totalWorkingDays;
      const sickHalfPay = Math.max(0, Math.min(sickLeave - 15, 15));
      const sickUnpaid = Math.max(0, sickLeave - 30);
      const sickDeduction = (sickHalfPay * dailyRate * 0.5) + (sickUnpaid * dailyRate);
      const unpaidDeduction = unpaidLeave * dailyRate;
      const absentDays = Math.max(0, totalWorkingDays - presentDays - paidLeaveDays - sickLeave - unpaidLeave);
      const absenceDeduction = absentDays * dailyRate;
      const lateDeduction = lateDays > 3 ? (lateDays - 3) * (dailyRate * 0.25) : 0;
      const totalDeductions = sickDeduction + unpaidDeduction + absenceDeduction + lateDeduction;
      const finalSalary = Math.max(0, baseSalary - totalDeductions);

      const displayId = await generateDisplayId('PAY');
      const { error: insErr } = await supabase.from('payroll').insert({
        display_id: displayId, employee_id: emp.user_id, year_month: yearMonth, base_salary: baseSalary,
        present_days: presentDays, late_days: lateDays, paid_leave_days: paidLeaveDays, sick_leave: sickLeave, unpaid_leave: unpaidLeave, absent_days: absentDays,
        total_hours: Math.round(totalHours),
        sick_deduction: Math.round(sickDeduction), unpaid_deduction: Math.round(unpaidDeduction),
        absence_deduction: Math.round(absenceDeduction), late_deduction: Math.round(lateDeduction),
        total_deductions: Math.round(totalDeductions),
        bonus: 0, allowances: 0, overtime: 0,
        final_salary: Math.round(finalSalary), status: 'Draft',
      });
      // 23505 = duplicate (employee already has payroll for this month) — safely ignore
      if (insErr && (insErr as any).code !== '23505') console.warn('payroll insert:', insErr.message);
    }
    load();
    toast.success('Payroll auto-calculated. You can now edit any field manually.');
  };

  const recomputeRowFinal = (row: any) => {
    const base = Number(row.base_salary) || 0;
    const totalDed = (Number(row.sick_deduction) || 0) + (Number(row.unpaid_deduction) || 0) + (Number(row.absence_deduction) || 0) + (Number(row.late_deduction) || 0);
    const earnings = (Number(row.bonus) || 0) + (Number(row.allowances) || 0) + (Number(row.overtime) || 0);
    const adj = entriesByPayroll[row.id] || { credit: 0, debit: 0 };
    return { totalDed, finalSalary: Math.max(0, Math.round(base - totalDed + earnings + adj.credit - adj.debit)) };
  };

  const confirmPayroll = async (id: string) => {
    await supabase.from('payroll').update({ status: 'Confirmed', confirmed_by: user?.email || '', confirmed_at: new Date().toISOString() }).eq('id', id);
    await auditLog('payroll_confirmed', 'payroll', id, {});
    toast.success('Payroll confirmed');
    load();
  };

  const lockMonth = async () => {
    await supabase.from('payroll').update({ locked: true, locked_at: new Date().toISOString(), locked_by: user?.email || '' } as any).eq('year_month', yearMonth);
    await auditLog('payroll_locked', 'payroll', yearMonth, {});
    toast.success(`Payroll for ${yearMonth} locked`);
    load();
  };

  const unlockMonth = async () => {
    await supabase.from('payroll').update({ locked: false, locked_at: null, locked_by: null } as any).eq('year_month', yearMonth);
    await auditLog('payroll_unlocked', 'payroll', yearMonth, {});
    toast.success(`Payroll for ${yearMonth} unlocked`);
    load();
  };

  const handleEdit = (p: any) => {
    setEditingId(p.id);
    const f: any = {};
    NUMERIC_FIELDS.forEach(k => { f[k] = p[k] ?? 0; });
    setEditForm(f);
  };

  const handleSaveEdit = async (p: any) => {
    const update: any = {};
    NUMERIC_FIELDS.forEach(k => { update[k] = Number(editForm[k]) || 0; });
    update.total_deductions = (update.sick_deduction || 0) + (update.unpaid_deduction || 0) + (update.absence_deduction || 0) + (update.late_deduction || 0);
    const earnings = (update.bonus || 0) + (update.allowances || 0) + (update.overtime || 0);
    const adj = entriesByPayroll[p.id] || { credit: 0, debit: 0 };
    update.final_salary = Math.max(0, Math.round((update.base_salary || 0) - update.total_deductions + earnings + adj.credit - adj.debit));
    const { error } = await supabase.from('payroll').update(update).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success('Saved');
    load();
  };

  const recomputeWithAdjustments = async (p: any) => {
    // Called after manual entries change — recalc final salary in DB
    const adj = entriesByPayroll[p.id] || { credit: 0, debit: 0 };
    const base = Number(p.base_salary) || 0;
    const totalDed = Number(p.total_deductions) || 0;
    const earnings = (Number(p.bonus) || 0) + (Number(p.allowances) || 0) + (Number(p.overtime) || 0);
    const finalSalary = Math.max(0, Math.round(base - totalDed + earnings + adj.credit - adj.debit));
    await supabase.from('payroll').update({ final_salary: finalSalary }).eq('id', p.id);
  };

  const handleEntriesSaved = async () => {
    if (!entriesModal) return;
    await load();
    // After load, entriesByPayroll is fresh — recompute the affected row's final salary
    const fresh = await supabase.from('payroll_entries').select('entry_type, amount').eq('payroll_id', entriesModal.id);
    const credits = new Set(['bonus', 'allowance', 'overtime', 'reimbursement']);
    let credit = 0, debit = 0;
    (fresh.data || []).forEach((e: any) => {
      if (credits.has(e.entry_type)) credit += Number(e.amount || 0); else debit += Number(e.amount || 0);
    });
    const base = Number(entriesModal.base_salary) || 0;
    const totalDed = Number(entriesModal.total_deductions) || 0;
    const earnings = (Number(entriesModal.bonus) || 0) + (Number(entriesModal.allowances) || 0) + (Number(entriesModal.overtime) || 0);
    const finalSalary = Math.max(0, Math.round(base - totalDed + earnings + credit - debit));
    await supabase.from('payroll').update({ final_salary: finalSalary }).eq('id', entriesModal.id);
    load();
  };

  const downloadPayslip = async (p: any) => {
    const emp = employees.find(e => e.user_id === p.employee_id);
    const { data: entries } = await supabase.from('payroll_entries').select('*').eq('payroll_id', p.id).order('created_at');
    const jsPDF = (await import('jspdf')).default;
    const { drawBrandHeader, drawBrandFooter } = await import('@/lib/pdf-helpers');
    const doc = new jsPDF();
    const headerBottom = await drawBrandHeader(doc, `Payslip — ${yearMonth}`);
    let y = headerBottom + 4;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Payslip ID: ${p.display_id}`, 140, y);
    y = headerBottom + 12;

    doc.setFontSize(9); doc.setTextColor(120); doc.text('EMPLOYEE', 18, y);
    doc.setTextColor(0); doc.setFontSize(10);
    y += 5; doc.text(emp?.name || '—', 18, y);
    y += 5; doc.text(emp?.email || '—', 18, y);
    y += 5; doc.text(`Status: ${p.status}${p.locked ? ' (Locked)' : ''}`, 18, y);

    y += 10;
    doc.setFillColor(5, 47, 89); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.setFontSize(9);
    doc.text('ATTENDANCE SUMMARY', 22, y + 5.5);
    y += 12; doc.setTextColor(0); doc.setFontSize(9);
    const totalWorkingDays = getWorkingDaysInMonth(yearMonth, weekendDays);
    const attRows = [
      ['Present Days', `${p.present_days || 0} / ${totalWorkingDays}`],
      ['Late Days', String(p.late_days || 0)],
      ['Absent Days', String(p.absent_days || 0)],
      ['Paid Leave', String(p.paid_leave_days || 0)],
      ['Sick Leave', String(p.sick_leave || 0)],
      ['Unpaid Leave', String(p.unpaid_leave || 0)],
      ['Total Hours', String(p.total_hours || 0)],
    ];
    attRows.forEach(([k, v]) => { doc.text(k, 22, y); doc.text(v, 188, y, { align: 'right' }); y += 6; });

    y += 4;
    doc.setFillColor(10, 112, 64); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.text('EARNINGS', 22, y + 5.5);
    y += 12; doc.setTextColor(0);
    const earnings: any[] = [
      ['Base Salary', p.base_salary || 0],
      ['Bonus', p.bonus || 0],
      ['Allowances', p.allowances || 0],
      ['Overtime', p.overtime || 0],
    ];
    (entries || []).filter((e: any) => ['bonus', 'allowance', 'overtime', 'reimbursement'].includes(e.entry_type))
      .forEach((e: any) => earnings.push([`${e.entry_type}: ${e.description}`, Number(e.amount)]));
    earnings.forEach(([k, v]: any) => { doc.text(String(k), 22, y); doc.text(formatCurrency(v), 188, y, { align: 'right' }); y += 6; });

    y += 4;
    doc.setFillColor(196, 57, 43); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.text('DEDUCTIONS', 22, y + 5.5);
    y += 12; doc.setTextColor(0);
    const deds: any[] = [
      ['Sick Deduction', p.sick_deduction || 0],
      ['Unpaid Deduction', p.unpaid_deduction || 0],
      ['Absence Deduction', p.absence_deduction || 0],
      ['Late Deduction', p.late_deduction || 0],
    ];
    (entries || []).filter((e: any) => ['deduction', 'advance', 'fine'].includes(e.entry_type))
      .forEach((e: any) => deds.push([`${e.entry_type}: ${e.description}`, Number(e.amount)]));
    const totalDedAll = deds.reduce((s, [, v]) => s + Number(v || 0), 0);
    deds.push(['Total Deductions', totalDedAll]);
    deds.forEach(([k, v]: any, i: number) => {
      if (i === deds.length - 1) doc.setFont(undefined, 'bold');
      doc.text(String(k), 22, y); doc.text(formatCurrency(v), 188, y, { align: 'right' });
      doc.setFont(undefined, 'normal');
      y += 6;
    });

    y += 6;
    doc.setFillColor(5, 47, 89); doc.rect(18, y, 174, 12, 'F');
    doc.setTextColor(255); doc.setFontSize(13);
    doc.text('FINAL SALARY', 22, y + 8);
    doc.text(formatCurrency(p.final_salary || 0), 188, y + 8, { align: 'right' });

    if (p.confirmed_by) {
      y += 18; doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Confirmed by ${p.confirmed_by} on ${new Date(p.confirmed_at).toLocaleString('en-GB')}`, 18, y);
    }

    await drawBrandFooter(doc, user?.email || '');
    doc.save(`Payslip_${(emp?.name || p.employee_id).replace(/\s+/g, '_')}_${yearMonth}.pdf`);
  };

  const totalPayroll = payroll.reduce((s, p) => s + (p.final_salary || 0), 0);
  const totalDeductions = payroll.reduce((s, p) => s + (p.total_deductions || 0), 0);

  const exportXlsx = () => {
    const rows = payroll.map(p => {
      const emp = employees.find(e => e.user_id === p.employee_id);
      const adj = entriesByPayroll[p.id] || { credit: 0, debit: 0 };
      return {
        Employee: emp?.name || '—',
        Email: emp?.email || '',
        'Base Salary': p.base_salary || 0,
        Present: p.present_days || 0,
        Late: p.late_days || 0,
        Absent: p.absent_days || 0,
        'Paid Leave': p.paid_leave_days || 0,
        Sick: p.sick_leave || 0,
        Deductions: p.total_deductions || 0,
        Bonus: p.bonus || 0,
        Allowances: p.allowances || 0,
        Overtime: p.overtime || 0,
        'Manual Credits': adj.credit,
        'Manual Debits': adj.debit,
        'Final Salary': p.final_salary || 0,
        Status: p.status,
      };
    });
    exportToExcel(rows, `payroll_${yearMonth}`, 'Payroll');
  };

  const numCell = (key: string, val: any, isEditing: boolean) => isEditing
    ? <input type="number" min="0" step="0.01" value={editForm[key] ?? 0}
        onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
        className="input-nawi w-20 text-xs py-1" />
    : <span>{val}</span>;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold font-display">Payroll Management</h2>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportXlsx} className="btn-outline"><Download className="w-4 h-4" /> Export Excel</button>
          {payroll.length > 0 && (
            monthLocked
              ? <button onClick={() => setPwdAction({ type: 'unlock', row: null })} className="btn-outline"><Unlock className="w-4 h-4" /> Unlock Month</button>
              : <button onClick={() => setPwdAction({ type: 'lock', row: null })} className="btn-outline"><Lock className="w-4 h-4" /> Lock Month</button>
          )}
          <button onClick={calculatePayroll} disabled={monthLocked} className="btn-primary disabled:opacity-50"><Calculator className="w-4 h-4" /> Auto-Calculate</button>
        </div>
      </div>

      {monthLocked && (
        <div className="card-nawi bg-warning/5 border-warning/30 flex items-center gap-3 py-3">
          <Lock className="w-5 h-5 text-warning" />
          <div className="text-sm">
            <strong className="text-warning">Payroll for {yearMonth} is locked.</strong>
            <span className="text-muted-foreground ml-2">Unlock to make changes.</span>
          </div>
        </div>
      )}

      {payroll.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Payroll</p><p className="text-xl font-bold font-display">{formatCurrency(totalPayroll)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Deductions</p><p className="text-xl font-bold font-display text-destructive">{formatCurrency(totalDeductions)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Employees</p><p className="text-xl font-bold font-display">{payroll.length}</p></div></div>
        </div>
      )}

      <div className="table-container">
        <table className="table-nawi w-full text-sm">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Base</th>
              <th>Present</th>
              <th>Late</th>
              <th>Absent</th>
              <th>Paid L.</th>
              <th>Sick</th>
              <th>Sick Ded.</th>
              <th>Absent Ded.</th>
              <th>Late Ded.</th>
              <th>Bonus</th>
              <th>Allow.</th>
              <th>OT</th>
              <th>Adjust.</th>
              <th>Final</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payroll.length === 0 ? (
              <tr><td colSpan={17} className="text-center text-muted-foreground py-8">Click "Auto-Calculate" to generate, then edit any field manually.</td></tr>
            ) : payroll.map(p => {
              const emp = employees.find(e => e.user_id === p.employee_id);
              const isEditing = editingId === p.id;
              const adj = entriesByPayroll[p.id] || { credit: 0, debit: 0 };
              const adjNet = adj.credit - adj.debit;
              return (
                <tr key={p.id}>
                  <td className="font-medium whitespace-nowrap">{emp?.name || '—'}</td>
                  <td>{numCell('base_salary', formatCurrency(p.base_salary), isEditing)}</td>
                  <td>{numCell('present_days', <><span className="text-success">{p.present_days || 0}</span>/{getWorkingDaysInMonth(yearMonth, weekendDays)}</>, isEditing)}</td>
                  <td>{numCell('late_days', p.late_days > 0 ? <span className="text-warning">{p.late_days}</span> : '0', isEditing)}</td>
                  <td>{numCell('absent_days', p.absent_days > 0 ? <span className="text-destructive">{p.absent_days}</span> : '0', isEditing)}</td>
                  <td>{numCell('paid_leave_days', p.paid_leave_days || 0, isEditing)}</td>
                  <td>{numCell('sick_leave', p.sick_leave || 0, isEditing)}</td>
                  <td className="text-destructive">{numCell('sick_deduction', formatCurrency(p.sick_deduction || 0), isEditing)}</td>
                  <td className="text-destructive">{numCell('absence_deduction', formatCurrency(p.absence_deduction || 0), isEditing)}</td>
                  <td className="text-destructive">{numCell('late_deduction', formatCurrency(p.late_deduction || 0), isEditing)}</td>
                  <td className="text-success">{numCell('bonus', formatCurrency(p.bonus || 0), isEditing)}</td>
                  <td>{numCell('allowances', formatCurrency(p.allowances || 0), isEditing)}</td>
                  <td>{numCell('overtime', formatCurrency(p.overtime || 0), isEditing)}</td>
                  <td>
                    <button onClick={() => !p.locked && setEntriesModal(p)} disabled={p.locked}
                      className={`text-xs px-2 py-1 rounded font-medium ${adjNet === 0 ? 'bg-muted text-muted-foreground' : adjNet > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'} ${p.locked ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
                      title="Manual line items">
                      <ListPlus className="w-3 h-3 inline mr-1" />
                      {adjNet === 0 ? 'Add' : (adjNet > 0 ? '+' : '') + formatCurrency(adjNet)}
                    </button>
                  </td>
                  <td className="font-bold whitespace-nowrap">{formatCurrency(p.final_salary)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="flex gap-1 items-center">
                      {isEditing ? (
                        <><button onClick={() => handleSaveEdit(p)} className="text-success p-1" title="Save"><Save className="w-3 h-3" /></button><button onClick={() => setEditingId(null)} className="text-muted-foreground p-1" title="Cancel"><X className="w-3 h-3" /></button></>
                      ) : p.locked ? (
                        <><Lock className="w-3 h-3 text-warning" /><button onClick={() => downloadPayslip(p)} className="text-primary p-1" title="Download payslip"><FileText className="w-3 h-3" /></button></>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(p)} className="text-secondary p-1" title="Edit all fields"><Edit className="w-3 h-3" /></button>
                          {p.status === 'Draft' && (
                            <button onClick={() => setPwdAction({ type: 'confirm', row: p })} className="btn-success text-xs px-2 py-0.5">Confirm</button>
                          )}
                          <button onClick={() => downloadPayslip(p)} className="text-primary p-1" title="Download payslip"><FileText className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        title={pwdAction?.type === 'lock' ? 'Lock Payroll Month' : pwdAction?.type === 'unlock' ? 'Unlock Payroll Month' : 'Confirm Payroll'}
        description={
          pwdAction?.type === 'lock' ? `Lock all payroll records for ${yearMonth}? Re-enter your password to confirm.` :
          pwdAction?.type === 'unlock' ? `Unlock payroll for ${yearMonth} so it can be edited again? Re-enter your password.` :
          `Confirm payroll for ${pwdAction?.row ? employees.find(e => e.user_id === pwdAction.row.employee_id)?.name : ''}? Re-enter your password.`
        }
        onConfirm={async () => {
          if (!pwdAction) return;
          if (pwdAction.type === 'lock') await lockMonth();
          else if (pwdAction.type === 'unlock') await unlockMonth();
          else if (pwdAction.type === 'confirm' && pwdAction.row) await confirmPayroll(pwdAction.row.id);
          setPwdAction(null);
        }}
      />

      {entriesModal && (
        <PayrollEntriesModal
          open={!!entriesModal}
          onClose={() => setEntriesModal(null)}
          payrollId={entriesModal.id}
          employeeName={employees.find(e => e.user_id === entriesModal.employee_id)?.name || '—'}
          onSaved={handleEntriesSaved}
        />
      )}
    </div>
  );
}
