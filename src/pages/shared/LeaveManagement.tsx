import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { Check, X, Upload, FileText, Calendar, Download, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, auditLog, calculateWorkingDays, generateDisplayId } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { toast } from 'sonner';

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Hajj', 'Bereavement', 'Emergency', 'Unpaid', 'Other'];
// Leave types that deduct from the annual leave balance
const BALANCE_DEDUCTING = ['Annual'];

export default function LeaveManagement({ isEmployee = false }: { isEmployee?: boolean }) {
  const { user, profile } = useAuth();
  const [leave, setLeave] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '', leaveType: 'Annual', document: null as any });
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employees, setEmployees] = useState<any[]>([]);
  const [pwdAction, setPwdAction] = useState<{ type: 'approve' | 'reject'; row: any } | null>(null);

  const load = async () => {
    if (!user) return;
    let query = supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
    if (isEmployee) query = query.eq('employee_id', user.id);
    const { data } = await query;
    setLeave(data || []);
  };

  useEffect(() => { load(); }, [user, isEmployee]);
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase.from('profiles').select('user_id, name').eq('status', 'active');
      setEmployees(data || []);
    };
    if (!isEmployee) fetchEmployees();
  }, [isEmployee]);

  let displayed = leave;
  if (employeeFilter !== 'all') displayed = displayed.filter((l: any) => l.employee_id === employeeFilter);
  if (statusFilter !== 'all') displayed = displayed.filter((l: any) => l.status === statusFilter);
  const monthFiltered = displayed.filter((l: any) => l.start_date?.startsWith(yearMonth) || l.end_date?.startsWith(yearMonth) || l.created_at?.startsWith(yearMonth));

  const pending = displayed.filter((l: any) => l.status === 'Pending');
  const history = monthFiltered.filter((l: any) => l.status !== 'Pending');

  const handleApprove = async (row: any) => {
    await supabase.from('leave_requests').update({ status: 'Approved' as any, reviewed_by: profile?.name || '', reviewed_at: new Date().toISOString() }).eq('id', row.id);
    // Deduct from leave_balance for balance-deducting types
    if (BALANCE_DEDUCTING.includes(row.leave_type)) {
      const { data: emp } = await supabase.from('profiles').select('leave_balance').eq('user_id', row.employee_id).maybeSingle();
      const current = emp?.leave_balance ?? 30;
      const next = Math.max(0, current - (row.days || 0));
      await supabase.from('profiles').update({ leave_balance: next }).eq('user_id', row.employee_id);
    }
    await auditLog('leave_approved', 'leave', row.id, { type: row.leave_type, days: row.days });
    toast.success(`Leave approved for ${row.employee_name}`);
    load();
  };
  const handleReject = async (row: any) => {
    await supabase.from('leave_requests').update({ status: 'Rejected' as any, reviewed_by: profile?.name || '', reviewed_at: new Date().toISOString() }).eq('id', row.id);
    await auditLog('leave_rejected', 'leave', row.id, {});
    toast.success(`Leave rejected for ${row.employee_name}`);
    load();
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, document: { name: file.name, base64: reader.result } });
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (form.leaveType === 'Sick' && !form.document) {
      if (!confirm('Sick leave requires a medical certificate. Submit without document?')) return;
    }
    const days = calculateWorkingDays(form.startDate, form.endDate);
    const displayId = await generateDisplayId('LVE');
    await supabase.from('leave_requests').insert([{
      display_id: displayId, employee_id: user.id, employee_name: profile.name,
      start_date: form.startDate, end_date: form.endDate, days, reason: form.reason,
      leave_type: form.leaveType, document: form.document as any,
    }]);
    setShowForm(false);
    setForm({ startDate: '', endDate: '', reason: '', leaveType: 'Annual', document: null });
    load();
  };

  const [y, mo] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const firstDayOfWeek = new Date(y, mo - 1, 1).getDay();

  const exportCSV = () => {
    const rows = monthFiltered.map(l => ({
      Employee: l.employee_name, Type: l.leave_type, Start: formatDate(l.start_date), End: formatDate(l.end_date),
      Days: l.days, Reason: l.reason, Status: l.status, ReviewedBy: l.reviewed_by || '',
    }));
    exportToExcel(rows, `leave_${yearMonth}`, 'Leave');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="input-nawi w-auto" />
          {!isEmployee && (
            <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className="input-nawi w-auto text-sm">
              <option value="all">All Employees</option>
              {employees.map((e: any) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Status</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /></button>
          {isEmployee && <button onClick={() => setShowForm(true)} className="btn-primary">Apply for Leave</button>}
        </div>
      </div>

      {isEmployee && (
        <div className="card-nawi flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><Wallet className="w-6 h-6 text-primary" /></div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Annual Leave Balance</p>
            <p className="text-2xl font-bold font-display">{profile?.leave_balance ?? 30} <span className="text-sm font-normal text-muted-foreground">days remaining</span></p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Used: {leave.filter(l => l.status === 'Approved' && l.leave_type === 'Annual').reduce((s, l) => s + (l.days || 0), 0)}</p>
            <p>Pending: {leave.filter(l => l.status === 'Pending' && l.leave_type === 'Annual').reduce((s, l) => s + (l.days || 0), 0)}</p>
          </div>
        </div>
      )}

      {!isEmployee && pending.length > 0 && (
        <div className="card-nawi border-warning/30">
          <h3 className="font-semibold font-display mb-3 text-warning">Pending Requests ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((l: any) => {
              const docBase64 = l.document?.base64?.startsWith('NAWI_ENC::') ? l.document.base64.replace('NAWI_ENC::', '') : l.document?.base64;
              const isImage = l.document?.type?.startsWith('image/') || l.document?.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
              return (
              <div key={l.id} className="flex items-start justify-between p-3 border border-border rounded-lg gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{l.employee_name}</p>
                  <p className="text-sm text-muted-foreground">{l.leave_type} • {formatDate(l.start_date)} — {formatDate(l.end_date)} ({l.days} days)</p>
                  <p className="text-sm text-muted-foreground">{l.reason}</p>
                  {l.document && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-secondary"><FileText className="w-3 h-3" /> {l.document.name}</span>
                      {isImage && docBase64 && (
                        <a href={docBase64} target="_blank" rel="noopener">
                          <img src={docBase64} alt={l.document.name} className="mt-1 w-32 h-24 object-cover rounded border border-border hover:opacity-80" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setPwdAction({ type: 'approve', row: l })} className="btn-success p-2" title="Approve"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setPwdAction({ type: 'reject', row: l })} className="btn-danger p-2" title="Reject"><X className="w-4 h-4" /></button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {!isEmployee && (
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Leave Calendar — {yearMonth}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className={`py-1 font-semibold ${d === 'Fri' || d === 'Sat' ? 'text-destructive/60' : 'text-muted-foreground'}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
              const dayLeaves = leave.filter((l: any) => l.status === 'Approved' && l.start_date <= dateStr && l.end_date >= dateStr);
              const dow = new Date(y, mo - 1, day).getDay();
              const isWE = dow === 5 || dow === 6;
              return (
                <div key={day} className={`p-1 rounded text-xs min-h-[40px] border ${isWE ? 'bg-muted/30 border-transparent' : dayLeaves.length > 0 ? 'border-secondary/30 bg-secondary/5' : 'border-border'}`}>
                  <span className="font-medium">{day}</span>
                  {dayLeaves.slice(0, 2).map((l: any, i: number) => (
                    <p key={i} className="text-[9px] text-secondary truncate">{l.employee_name?.split(' ')[0]}</p>
                  ))}
                  {dayLeaves.length > 2 && <p className="text-[9px] text-muted-foreground">+{dayLeaves.length - 2}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Doc</th><th>Status</th><th>Reviewed By</th></tr></thead>
          <tbody>
            {(isEmployee ? leave : [...pending, ...history]).map((l: any) => (
              <tr key={l.id}>
                <td>{l.employee_name}</td>
                <td><span className="badge-new text-xs">{l.leave_type || 'Annual'}</span></td>
                <td>{formatDate(l.start_date)}</td><td>{formatDate(l.end_date)}</td><td>{l.days}</td>
                <td className="max-w-[150px] truncate">{l.reason}</td>
                <td>{(() => {
                  if (!l.document) return '—';
                  const docBase64 = l.document.base64?.startsWith('NAWI_ENC::') ? l.document.base64.replace('NAWI_ENC::', '') : l.document.base64;
                  const isImg = l.document.type?.startsWith('image/') || l.document.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  return isImg && docBase64 ? (
                    <a href={docBase64} target="_blank" rel="noopener"><img src={docBase64} alt="" className="w-8 h-8 object-cover rounded border border-border" /></a>
                  ) : <FileText className="w-4 h-4 text-secondary" />;
                })()}</td>
                <td><StatusBadge status={l.status} /></td><td>{l.reviewed_by || '—'}</td>
              </tr>
            ))}
            {(isEmployee ? leave : [...pending, ...history]).length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No leave records</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Apply for Leave</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type *</label>
                <select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })} className="input-nawi">
                  {LEAVE_TYPES.map(lt => <option key={lt} value={lt}>{lt}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start Date *</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">End Date *</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input-nawi" required /></div>
              </div>
              {form.startDate && form.endDate && <p className="text-sm font-medium text-primary">{calculateWorkingDays(form.startDate, form.endDate)} working days</p>}
              <div><label className="block text-sm font-medium mb-1">Reason *</label><textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-nawi" rows={3} required /></div>
              <div>
                <label className="block text-sm font-medium mb-1">Supporting Document {form.leaveType === 'Sick' && <span className="text-destructive">(Required for Sick Leave)</span>}</label>
                <label className="btn-outline cursor-pointer w-full justify-center">
                  <Upload className="w-4 h-4" /> {form.document ? form.document.name : 'Upload Document'}
                  <input type="file" className="hidden" onChange={handleDocUpload} />
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        title={pwdAction?.type === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        description={pwdAction?.row ? `${pwdAction.type === 'approve' ? 'Approve' : 'Reject'} ${pwdAction.row.days}-day ${pwdAction.row.leave_type} leave for ${pwdAction.row.employee_name}? Re-enter your password.` : ''}
        destructive={pwdAction?.type === 'reject'}
        onConfirm={async () => {
          if (!pwdAction?.row) return;
          if (pwdAction.type === 'approve') await handleApprove(pwdAction.row);
          else await handleReject(pwdAction.row);
          setPwdAction(null);
        }}
      />
    </div>
  );
}
