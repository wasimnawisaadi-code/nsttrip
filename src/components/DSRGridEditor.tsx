import { useEffect, useMemo, useRef, useState } from 'react';
import { DSRTemplate, DSREntry, createEntry, updateEntry, deleteEntry, fetchEntries } from '@/lib/dsr-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Save, RotateCcw, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

type Row = {
  id?: string;            // existing entry id
  entry_date: string;
  employee_id?: string;   // existing entry employee id
  data: Record<string, any>;
  dirty?: boolean;
  isNew?: boolean;
};

interface Props {
  template: DSRTemplate;
  fromDate: string;
  toDate: string;
  isAdmin: boolean;
  employeeFilter: string; // "all" or user_id
  workingDate: string;
  onWorkingDateChange: (date: string) => void;
  onChanged?: () => void;
}

/**
 * Excel-like inline editor for DSR rows.
 * - Add / edit / delete rows directly in the grid (no wizard modal)
 * - Auto-detect today date OR manual per-row date selection
 * - Save dirty rows in batch
 */
export default function DSRGridEditor({ template, fromDate, toDate, isAdmin, employeeFilter, workingDate, onWorkingDateChange, onChanged }: Props) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const STORAGE_KEY = useMemo(() => `dsr-draft-${template.id}-${user?.id}`, [template.id, user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchEntries({
        templateId: template.id,
        fromDate, toDate,
        employeeId: employeeFilter !== 'all' ? employeeFilter : undefined,
        isAdmin, currentUserId: user.id,
      });
      
      const serverRows = data.map(e => ({ id: e.id, entry_date: e.entry_date, employee_id: e.employee_id, data: { ...e.data, __employee: e.employee_name } }));
      
      // Check for local drafts
      const draftRaw = localStorage.getItem(STORAGE_KEY);
      if (draftRaw) {
        try {
          const draftRows = JSON.parse(draftRaw) as Row[];
          if (draftRows.length > 0 && confirm(`Found ${draftRows.length} unsaved changes from your last session. Restore them?`)) {
            // Merge draft rows into server rows
            // For now, let's just append new draft rows and keep track of dirty existing rows
            const combined = [...serverRows];
            draftRows.forEach(dr => {
              if (dr.id) {
                const idx = combined.findIndex(cr => cr.id === dr.id);
                if (idx !== -1) combined[idx] = dr;
              } else {
                combined.push(dr);
              }
            });
            setRows(combined);
            toast.success('Draft restored');
            setLoading(false);
            return;
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch (e) {
          console.error('Failed to parse DSR draft', e);
        }
      }
      
      setRows(serverRows);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [template.id, fromDate, toDate, employeeFilter, user]);

  // Auto-save dirty rows to localStorage
  useEffect(() => {
    const dirtyRows = rows.filter(r => r.dirty);
    if (dirtyRows.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dirtyRows));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [rows, STORAGE_KEY]);

  const addRow = () => {
    const newRow: Row = {
      entry_date: workingDate,
      data: {},
      dirty: true,
      isNew: true,
    };
    setRows(prev => [...prev, newRow]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
  };

  const updateCell = (idx: number, key: string, value: any) => {
    setRows(prev => {
      const next = [...prev];
      const rowData = { ...next[idx].data, [key]: value };
      
      // Auto-calculate profit if this is a financial field update
      const col = template.columns.find(c => c.key === key);
      if (col?.financial === 'sale' || col?.financial === 'cost') {
        const saleCol = template.columns.find(c => c.financial === 'sale');
        const costCol = template.columns.find(c => c.financial === 'cost');
        const profitCol = template.columns.find(c => c.financial === 'profit');
        
        if (saleCol && costCol && profitCol) {
          const saleVal = parseFloat(rowData[saleCol.key]) || 0;
          const costVal = parseFloat(rowData[costCol.key]) || 0;
          rowData[profitCol.key] = (saleVal - costVal).toString();
        }
      }

      next[idx] = { ...next[idx], data: rowData, dirty: true };
      return next;
    });
  };

  const updateDate = (idx: number, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], entry_date: value, dirty: true };
      return next;
    });
  };

  const removeRow = async (idx: number) => {
    const r = rows[idx];
    if (r.id) {
      if (!confirm('Delete this saved row?')) return;
      try {
        await deleteEntry(r.id);
        toast.success('Deleted');
        onChanged?.(); // Trigger parent refresh (KPIs)
        load();        // Trigger local refresh (Grid)
      } catch (e: any) { toast.error(e.message); }
    } else {
      setRows(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const clearAllDrafts = () => {
    const dirty = rows.filter(r => r.dirty);
    if (dirty.length === 0) return;
    if (!confirm(`Clear all ${dirty.length} unsaved changes?`)) return;
    load(); // Simply reload from server to discard all local changes
    toast.success('Drafts cleared');
  };

  const saveAll = async () => {
    if (!user || !profile) return;
    const dirty = rows.map((r, i) => ({ r, i })).filter(x => x.r.dirty);
    if (dirty.length === 0) { toast.info('No changes'); return; }
    setSaving(true);
    try {
      const requiredKeys = template.columns.filter(c => c.required).map(c => c.key);
      for (const { r } of dirty) {
        const missing = requiredKeys.filter(k => !r.data[k] || String(r.data[k]).trim() === '');
        if (missing.length > 0) throw new Error(`Required: ${template.columns.filter(c => requiredKeys.includes(c.key) && missing.includes(c.key)).map(c => c.label).join(', ')}`);
        const cleanData = { ...r.data }; delete cleanData.__employee;
        if (r.id) await updateEntry(r.id, template, cleanData);
        else await createEntry(template, user.id, profile.name, r.entry_date, cleanData);
      }
      toast.success(`Saved ${dirty.length} row${dirty.length > 1 ? 's' : ''}`);
      onChanged?.(); // Refresh parent KPIs
      load();        // Refresh local grid
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const dirtyCount = useMemo(() => rows.filter(r => r.dirty).length, [rows]);
  const ownsRow = (r: Row) => isAdmin || !r.id || (r.employee_id === user?.id);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const s = searchTerm.toLowerCase();
    return rows.filter(r => {
      return Object.values(r.data).some(val => String(val || '').toLowerCase().includes(s)) ||
             r.entry_date.includes(s) ||
             (r.data.__employee && String(r.data.__employee).toLowerCase().includes(s));
    });
  }, [rows, searchTerm]);

  const SkeletonRow = () => (
    <tr className="border-t animate-pulse">
      <td className="p-2"><div className="h-4 w-4 bg-muted rounded" /></td>
      <td className="p-2"><div className="h-8 w-full bg-muted rounded" /></td>
      {isAdmin && <td className="p-2"><div className="h-4 w-24 bg-muted rounded" /></td>}
      {template.columns.map(c => (
        <td key={c.key} className="p-2"><div className="h-8 w-full bg-muted rounded" /></td>
      ))}
      <td className="p-2"></td>
    </tr>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-4 flex-wrap flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wider">
              <CalendarClock className="w-3.5 h-3.5" /> Working Date
            </Label>
            <Input 
              type="date" 
              value={workingDate} 
              onChange={e => onWorkingDateChange(e.target.value)} 
              className="w-40 h-8 text-xs font-medium border-primary/30 focus:border-primary" 
            />
          </div>
          
          <div className="relative flex-1 max-w-xs">
            <Plus className="absolute left-2.5 top-2.5 h-3 w-3 text-muted-foreground rotate-45" />
            <Input 
              placeholder="Search in grid..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs bg-background/50 focus:bg-background"
            />
          </div>

          {dirtyCount > 0 && (
            <span className="text-xs px-2 py-1 bg-warning/15 text-warning rounded-full font-medium flex items-center gap-1 animate-in fade-in zoom-in duration-300">
              <Save className="w-3 h-3" /> {dirtyCount} unsaved rows
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />Reload
          </Button>
          {!isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={clearAllDrafts} disabled={dirtyCount === 0} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5 mr-1" />Delete All
              </Button>
              <Button size="sm" onClick={addRow} className="bg-primary hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5 mr-1" />Add Row
              </Button>
            </div>
          )}
          <Button size="sm" onClick={saveAll} disabled={saving || dirtyCount === 0} className="bg-success hover:bg-success/90 text-white">
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving…' : 'Save All Changes'}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="table-container max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 sticky top-0 z-10">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left p-2 w-10">#</th>
              <th className="text-left p-2 w-36 min-w-[140px]">Date</th>
              {isAdmin && <th className="text-left p-2 w-32 min-w-[120px]">Employee</th>}
              {template.columns.map(c => (
                <th key={c.key} className="text-left p-2 min-w-[140px] whitespace-nowrap">
                  {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
                </th>
              ))}
              <th className="p-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={template.columns.length + 4} className="text-center py-12 text-muted-foreground">
                {searchTerm ? 'No matches found for your search.' : 'No rows. Click "Add Row" to start.'}
              </td></tr>
            )}
            {filteredRows.map((r, idx) => (
              <tr key={r.id || `new-${idx}`} className={`border-t hover:bg-muted/20 transition-colors animate-in fade-in slide-in-from-left-2 duration-300 ${r.dirty ? 'bg-warning/5' : ''}`}>
                <td className="p-2 text-xs text-muted-foreground">{idx + 1}</td>
                <td className="p-1">
                  <Input type="date" value={r.entry_date} onChange={e => updateDate(idx, e.target.value)}
                    disabled={!ownsRow(r)} className="h-8 text-xs" />
                </td>
                {isAdmin && <td className="p-2 text-xs">{r.data.__employee || '—'}</td>}
                {template.columns.map(c => (
                  <td key={c.key} className="p-1">
                    {c.type === 'select' ? (
                      <Select value={r.data[c.key] || ''} onValueChange={v => updateCell(idx, c.key, v)} disabled={!ownsRow(r)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{c.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                        value={r.data[c.key] ?? ''}
                        onChange={e => updateCell(idx, c.key, e.target.value)}
                        disabled={!ownsRow(r)}
                        className="h-8 text-xs"
                        placeholder={c.label}
                      />
                    )}
                  </td>
                ))}
                <td className="p-1 text-center">
                  {ownsRow(r) && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating Action Bar for Unsaved Changes */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-background/80 backdrop-blur-md border border-warning/50 shadow-2xl rounded-full p-2 pl-6 flex items-center gap-6 ring-4 ring-warning/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-tight text-warning leading-none">Unsaved Changes</span>
              <span className="text-xs font-medium text-muted-foreground">{dirtyCount} row{dirtyCount !== 1 ? 's' : ''} modified</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={clearAllDrafts} className="rounded-full text-muted-foreground hover:text-destructive">
                Discard
              </Button>
              <Button size="sm" onClick={saveAll} disabled={saving} className="rounded-full bg-success hover:bg-success/90 text-white shadow-lg shadow-success/20 px-6">
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Tip: Edit any cell directly. Use the <strong>Search</strong> to find rows. Unsaved changes are kept even if you refresh!
      </p>
    </div>
  );
}
