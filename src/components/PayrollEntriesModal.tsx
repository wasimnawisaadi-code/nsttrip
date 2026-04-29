import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/supabase-service';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Entry {
  id: string;
  payroll_id: string;
  entry_type: string;
  description: string;
  amount: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  payrollId: string;
  employeeName: string;
  onSaved: () => void; // recompute parent totals
}

const TYPES = [
  { v: 'bonus', label: 'Bonus', sign: 1 },
  { v: 'allowance', label: 'Allowance', sign: 1 },
  { v: 'overtime', label: 'Overtime', sign: 1 },
  { v: 'reimbursement', label: 'Reimbursement', sign: 1 },
  { v: 'deduction', label: 'Deduction', sign: -1 },
  { v: 'advance', label: 'Salary Advance', sign: -1 },
  { v: 'fine', label: 'Fine / Penalty', sign: -1 },
];

export default function PayrollEntriesModal({ open, onClose, payrollId, employeeName, onSaved }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ entry_type: 'bonus', description: '', amount: '' });

  const load = async () => {
    if (!payrollId) return;
    setLoading(true);
    const { data } = await supabase.from('payroll_entries').select('*').eq('payroll_id', payrollId).order('created_at', { ascending: false });
    setEntries((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, payrollId]);

  const handleAdd = async () => {
    const amt = Number(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt <= 0) {
      toast.error('Enter description and a positive amount');
      return;
    }
    const { error } = await supabase.from('payroll_entries').insert({
      payroll_id: payrollId,
      entry_type: form.entry_type,
      description: form.description.trim(),
      amount: amt,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Entry added');
    setForm({ entry_type: 'bonus', description: '', amount: '' });
    await load();
    onSaved();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase.from('payroll_entries').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    await load();
    onSaved();
  };

  if (!open) return null;

  const totalCredit = entries.filter(e => TYPES.find(t => t.v === e.entry_type)?.sign === 1).reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalDebit = entries.filter(e => TYPES.find(t => t.v === e.entry_type)?.sign === -1).reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-elevated w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold font-display">Manual Line Items</h3>
            <p className="text-xs text-muted-foreground">{employeeName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Add form */}
          <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add new entry</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={form.entry_type}
                onChange={e => setForm(f => ({ ...f, entry_type: e.target.value }))}
                className="input-nawi text-sm py-1.5 sm:col-span-3"
              >
                {TYPES.map(t => <option key={t.v} value={t.v}>{t.label} {t.sign === 1 ? '(+)' : '(−)'}</option>)}
              </select>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (e.g. Eid bonus, Phone advance)"
                className="input-nawi text-sm py-1.5 sm:col-span-6"
              />
              <input
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Amount"
                className="input-nawi text-sm py-1.5 sm:col-span-2"
              />
              <button onClick={handleAdd} className="btn-primary text-sm sm:col-span-1 justify-center">Add</button>
            </div>
          </div>

          {/* Entries list */}
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No manual entries yet.</p>
          ) : (
            <div className="space-y-2">
              {entries.map(e => {
                const type = TYPES.find(t => t.v === e.entry_type);
                const isCredit = type?.sign === 1;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${isCredit ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{type?.label || e.entry_type}</span>
                        <p className="text-sm font-medium truncate">{e.description}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.created_at).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className={`text-sm font-bold ${isCredit ? 'text-success' : 'text-destructive'}`}>
                      {isCredit ? '+' : '−'} {formatCurrency(e.amount)}
                    </span>
                    <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 bg-muted/30 grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-[11px] text-muted-foreground">Total Credits</p><p className="font-bold text-success">+{formatCurrency(totalCredit)}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Total Debits</p><p className="font-bold text-destructive">−{formatCurrency(totalDebit)}</p></div>
          <div><p className="text-[11px] text-muted-foreground">Net Adjustment</p><p className="font-bold">{formatCurrency(totalCredit - totalDebit)}</p></div>
        </div>
      </div>
    </div>
  );
}
