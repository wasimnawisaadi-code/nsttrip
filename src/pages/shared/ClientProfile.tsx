import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, FileText, Trash2, Plus, Save, X, Upload, Download, MessageCircle, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, daysUntil, getDateStatus, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import WhatsAppTemplateModal from '@/components/WhatsAppTemplateModal';
import jsPDF from 'jspdf';

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const [client, setClient] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [newNote, setNewNote] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: '', notes: '' });
  const [showQuotation, setShowQuotation] = useState(false);
  const [lineItems, setLineItems] = useState([{ description: '', amount: 0 }]);
  const [payableAmount, setPayableAmount] = useState(0);
  const [quoNotes, setQuoNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const basePath = isAdmin ? '/admin' : '/employee';

  const load = async () => {
    const [clientRes, tasksRes, quoRes, histRes, empRes, svcRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('tasks').select('*').eq('client_id', id),
      supabase.from('quotations').select('*').eq('client_id', id),
      supabase.from('audit_log').select('*').eq('target_id', id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('client_services').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ]);
    if (clientRes.data) { setClient(clientRes.data); setForm(clientRes.data); }
    setTasks(tasksRes.data || []);
    setQuotations(quoRes.data || []);
    setHistory(histRes.data || []);
    setEmployees(empRes.data || []);
    setServices(svcRes.data || []);
  };

  useEffect(() => { load(); }, [id]);

  if (!client) return <div className="skeleton-nawi h-64 w-full" />;

  const assignedEmp = employees.find((e: any) => e.user_id === client.assigned_to);

  const handleSave = async () => {
    await supabase.from('clients').update({
      name: form.name, mobile: form.mobile, email: form.email, client_type: form.client_type,
      lead_source: form.lead_source, service: form.service, service_subcategory: form.service_subcategory,
      nationality: form.nationality, company_name: form.company_name, payment_type: form.payment_type,
      revenue: Number(form.revenue) || 0, profit: Number(form.profit) || 0,
    }).eq('id', client.id);
    await auditLog('client_updated', 'client', client.id, {});
    setEditing(false);
    load();
  };

  const handleStatusUpdate = async (newStatus: string) => {
    await supabase.from('clients').update({ status: newStatus as any }).eq('id', client.id);
    await auditLog('client_status_updated', 'client', client.id, { status: newStatus });
    setClient({ ...client, status: newStatus });
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    const notes = client.notes ? client.notes + '\n---\n' : '';
    const entry = `[${profile?.name || 'User'} - ${new Date().toLocaleString()}] ${newNote}`;
    const updated = notes + entry;
    await supabase.from('clients').update({ notes: updated }).eq('id', client.id);
    setClient({ ...client, notes: updated });
    setNewNote('');
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const displayId = await generateDisplayId('TSK');
    await supabase.from('tasks').insert({
      display_id: displayId, client_id: client.id, client_name: client.name, service: client.service,
      title: taskForm.title, assigned_to: user.id, assigned_to_name: profile?.name || '',
      due_date: taskForm.dueDate, status: 'New' as const, notes: taskForm.notes, created_by: user.id,
    });
    await auditLog('task_created', 'task', displayId, { clientId: client.id });
    setShowTaskModal(false);
    setTaskForm({ title: '', dueDate: '', notes: '' });
    load();
  };

  const handleDelete = async () => {
    await supabase.from('client_services').delete().eq('client_id', client.id);
    await supabase.from('quotations').delete().eq('client_id', client.id);
    await supabase.from('tasks').delete().eq('client_id', client.id);
    await supabase.from('clients').delete().eq('id', client.id);
    await auditLog('client_deleted', 'client', client.id, { name: client.name });
    navigate(basePath + '/clients');
  };

  const buildFollowUpMessage = () =>
    `Dear ${client.name},\n\nThis is a follow-up regarding your ${client.service || 'service'} enquiry with Nawi Saadi Travel & Tourism.\n\nPlease let us know if you need any updates or have additional questions.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;

  const quotedPrice = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const profit = quotedPrice - payableAmount;

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(5, 47, 89);
    doc.text('NAWI SAADI TRAVEL & TOURISM', 20, 25);
    doc.setFontSize(10); doc.setTextColor(100); doc.text('Travel & Tourism Services', 20, 32);
    doc.line(20, 36, 190, 36);
    doc.setFontSize(14); doc.setTextColor(5, 47, 89); doc.text('QUOTATION', 20, 46);
    doc.setFontSize(10); doc.setTextColor(50);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 140, 46);
    if (validUntil) doc.text(`Valid Until: ${new Date(validUntil).toLocaleDateString('en-GB')}`, 140, 52);
    doc.setFontSize(10); doc.text('PREPARED FOR:', 20, 60); doc.setTextColor(0);
    doc.text(client.name, 20, 66); doc.text(client.mobile || '', 20, 72); doc.text(client.email || '', 20, 78);
    if (client.service) doc.text(`Service: ${client.service}${client.service_subcategory ? ` (${client.service_subcategory})` : ''}`, 20, 84);
    let y = 96;
    doc.setFillColor(5, 47, 89); doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255); doc.setFontSize(9);
    doc.text('DESCRIPTION', 25, y + 5.5); doc.text('AMOUNT (AED)', 155, y + 5.5);
    y += 12; doc.setTextColor(0);
    lineItems.forEach((li) => { if (!li.description) return; doc.text(li.description, 25, y); doc.text(li.amount.toLocaleString(), 160, y, { align: 'right' }); y += 7; });
    doc.line(20, y, 190, y); y += 8;
    doc.setFontSize(11); doc.setTextColor(5, 47, 89);
    doc.text(`TOTAL: AED ${quotedPrice.toLocaleString()}`, 20, y);
    if (quoNotes) { y += 12; doc.setFontSize(9); doc.setTextColor(100); doc.text(`Notes: ${quoNotes}`, 20, y); }
    y += 16; doc.setFontSize(9); doc.text(`Authorized by: ${profile?.name}`, 20, y);
    doc.save(`Quotation_${client.name}.pdf`);
  };

  const saveQuotation = async () => {
    if (!user) return;
    const displayId = await generateDisplayId('QUO');
    await supabase.from('quotations').insert({
      display_id: displayId, client_id: client.id, client_name: client.name, service: client.service,
      line_items: lineItems as any, quoted_price: quotedPrice, payable_amount: payableAmount, profit,
      status: 'Draft', generated_by: user.id, valid_until: validUntil || null,
    });
    await supabase.from('clients').update({
      revenue: (client.revenue || 0) + quotedPrice,
      profit: (client.profit || 0) + profit,
    }).eq('id', client.id);
    await auditLog('quotation_generated', 'quotation', displayId, { clientId: client.id });
    setShowQuotation(false);
    setLineItems([{ description: '', amount: 0 }]);
    setPayableAmount(0);
    load();
  };

  const dateStatusColors: Record<string, string> = {
    safe: 'text-success border-success/20 bg-success/5',
    warning: 'text-warning border-warning/20 bg-warning/5',
    urgent: 'text-destructive border-destructive/20 bg-destructive/5',
    overdue: 'text-destructive border-destructive/30 bg-destructive/10',
  };

  const tabList = ['overview', 'documents', 'dates', 'quotations', 'tasks', 'revenue', 'notes', 'history'];
  const importantDates = (client.important_dates || {}) as Record<string, string>;
  const documents = (client.documents || []) as any[];
  const serviceDetails = (client.service_details || {}) as Record<string, string>;

  // ---- Documents handlers (add / delete) ----
  const uid = () => Math.random().toString(36).slice(2, 10);
  const handleAddDocument = (file: File, customName: string) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const entry = {
        id: uid(),
        name: customName || file.name,
        fileName: file.name,
        fileType: file.type,
        base64: `NAWI_ENC::${reader.result as string}`,
        uploadedAt: new Date().toISOString(),
      };
      const updated = [...documents, entry];
      await supabase.from('clients').update({ documents: updated as any }).eq('id', client.id);
      await auditLog('document_added', 'client', client.id, { name: entry.name });
      toast.success('Document added');
      load();
    };
    reader.readAsDataURL(file);
  };
  const handleDeleteDocument = async (idx: number) => {
    if (!confirm('Delete this document?')) return;
    const updated = documents.filter((_: any, i: number) => i !== idx);
    await supabase.from('clients').update({ documents: updated as any }).eq('id', client.id);
    await auditLog('document_deleted', 'client', client.id, {});
    toast.success('Deleted');
    load();
  };

  // ---- Dates handlers (add / delete) ----
  const handleAddDate = async (name: string, date: string) => {
    if (!name || !date) { toast.error('Enter name and date'); return; }
    const updated = { ...importantDates, [name]: date };
    await supabase.from('clients').update({ important_dates: updated as any }).eq('id', client.id);
    await auditLog('date_added', 'client', client.id, { name, date });
    toast.success('Date added');
    load();
  };
  const handleDeleteDate = async (key: string) => {
    if (!confirm(`Delete date "${key}"?`)) return;
    const updated: Record<string, string> = { ...importantDates };
    delete updated[key];
    await supabase.from('clients').update({ important_dates: updated as any }).eq('id', client.id);
    toast.success('Deleted');
    load();
  };

  const buildWelcomeMessage = () =>
    `Dear ${client.name},\n\nThank you for choosing Nawi Saadi Travel & Tourism! 🌟\n\nWe have received your enquiry${client.service ? ` for ${client.service}` : ''} and our team will be in touch shortly.\n\nFor any questions, feel free to reply to this message.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to={`${basePath}/clients`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>

      <div className="card-nawi">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{client.display_id}</span>
              <StatusBadge status={client.status} />
              {client.service && <span className="badge-new">{client.service}</span>}
              {client.service_subcategory && <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">{client.service_subcategory}</span>}
              {client.client_type && <span className="text-xs text-muted-foreground">{client.client_type}</span>}
              {assignedEmp && <span className="text-xs text-muted-foreground">→ {assignedEmp.name}</span>}
              {services.length > 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{services.length} services</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={client.status} onChange={(e) => handleStatusUpdate(e.target.value)} className="input-nawi w-auto text-sm">
              <option value="New">New</option><option value="Processing">Processing</option><option value="Success">Success</option><option value="Failed">Failed</option>
            </select>
            <button onClick={() => navigate(`${basePath}/clients/new?edit=${client.id}`)} className="btn-outline"><Edit className="w-4 h-4" /> Edit</button>
            <button onClick={() => setShowWhatsApp(true)} className="btn-outline" disabled={!client.mobile}><MessageCircle className="w-4 h-4" /> WhatsApp</button>
            <button onClick={() => setShowQuotation(true)} className="btn-secondary"><FileText className="w-4 h-4" /> Quotation</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabList.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card-nawi">
          {editing && <div className="flex justify-end mb-4 gap-2"><button onClick={handleSave} className="btn-primary"><Save className="w-4 h-4" /> Save</button><button onClick={() => setEditing(false)} className="btn-outline"><X className="w-4 h-4" /></button></div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Name', key: 'name' }, { label: 'Mobile', key: 'mobile' }, { label: 'Email', key: 'email' },
              { label: 'Client Type', key: 'client_type' }, { label: 'Lead Source', key: 'lead_source' }, { label: 'Service', key: 'service' },
              { label: 'Service Type', key: 'service_subcategory' }, { label: 'Nationality', key: 'nationality' },
              { label: 'Company', key: 'company_name' }, { label: 'Payment Type', key: 'payment_type' },
              { label: 'Revenue', key: 'revenue' }, { label: 'Profit', key: 'profit' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editing ? (
                  <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: ['revenue', 'profit'].includes(key) ? Number(e.target.value) : e.target.value })} className="input-nawi" />
                ) : (
                  <p className="text-sm font-medium text-foreground">{['revenue', 'profit'].includes(key) ? formatCurrency(client[key] || 0) : (client[key] || '—')}</p>
                )}
              </div>
            ))}
          </div>
          {Object.keys(serviceDetails).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-3">Current Service Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(serviceDetails).filter(([_, v]) => v).map(([k, v]) => (
                  <div key={k}><label className="block text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</label><p className="text-sm font-medium">{v as string}</p></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <ProfileDocumentsTab
          documents={documents}
          onAdd={handleAddDocument}
          onDelete={handleDeleteDocument}
        />
      )}

      {tab === 'dates' && (
        <ProfileDatesTab
          dates={importantDates}
          dateStatusColors={dateStatusColors}
          onAdd={handleAddDate}
          onDelete={handleDeleteDate}
        />
      )}

      {/* Family tab removed — simplified to one client = one record */}

      {tab === 'quotations' && (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Quotations</h3>
            <button onClick={() => setShowQuotation(true)} className="btn-primary"><Plus className="w-4 h-4" /> Generate</button>
          </div>
          {quotations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No quotations yet</p>
          ) : (
            <div className="table-container">
              <table className="table-nawi w-full">
                <thead><tr><th>ID</th><th>Date</th><th>Quoted</th><th>Payable</th><th>Profit</th><th>Status</th></tr></thead>
                <tbody>{quotations.map((q: any) => <tr key={q.id}><td className="font-mono text-xs">{q.display_id}</td><td>{formatDate(q.generated_at)}</td><td>{formatCurrency(q.quoted_price)}</td><td>{formatCurrency(q.payable_amount)}</td><td className="text-success font-medium">{formatCurrency(q.profit)}</td><td><StatusBadge status={q.status} /></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Tasks</h3>
            <button onClick={() => setShowTaskModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Task</button>
          </div>
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No tasks yet</p> : (
            <div className="space-y-3">
              {tasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div><p className="font-medium">{t.title}</p><p className="text-xs text-muted-foreground">Due: {formatDate(t.due_date)} • {t.assigned_to_name}</p></div>
                  <div className="flex items-center gap-2"><StatusBadge status={t.status} />{t.profit > 0 && <span className="text-sm font-medium text-success">{formatCurrency(t.profit)}</span>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'revenue' && (
        <div className="card-nawi">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-muted/50 rounded-xl"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display">{formatCurrency(client.revenue || 0)}</p></div>
            <div className="p-4 bg-success/5 rounded-xl border border-success/20"><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display text-success">{formatCurrency(client.profit || 0)}</p></div>
          </div>
          {quotations.length > 0 && (
            <div className="table-container">
              <table className="table-nawi w-full">
                <thead><tr><th>Quotation</th><th>Date</th><th>Service</th><th>Quoted</th><th>Payable</th><th>Profit</th></tr></thead>
                <tbody>{quotations.map((q: any) => <tr key={q.id}><td className="font-mono text-xs">{q.display_id}</td><td>{formatDate(q.generated_at)}</td><td>{q.service}</td><td>{formatCurrency(q.quoted_price)}</td><td>{formatCurrency(q.payable_amount)}</td><td className="text-success font-medium">{formatCurrency(q.profit)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4">Notes</h3>
          <div className="flex gap-2 mb-4">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className="input-nawi flex-1" placeholder="Add a note..." onKeyDown={(e) => e.key === 'Enter' && handleAddNote()} />
            <button onClick={handleAddNote} className="btn-primary">Add</button>
          </div>
          {client.notes ? (
            <div className="space-y-3">{client.notes.split('\n---\n').reverse().map((note: string, i: number) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">{note}</div>
            ))}</div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>}
        </div>
      )}

      {tab === 'history' && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4">History</h3>
          {history.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No history</p> : (
            <div className="space-y-3">{history.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${h.action.includes('delete') ? 'bg-destructive' : h.action.includes('create') ? 'bg-success' : 'bg-secondary'}`} />
                <div><p className="text-sm"><span className="font-medium">{h.user_name}</span> {h.action.replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">{formatDate(h.created_at)}</p></div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Add Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Title *</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className="input-nawi" rows={3} /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowTaskModal(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Add Task</button></div>
            </form>
          </div>
        </div>
      )}

      {showQuotation && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowQuotation(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Generate Quotation — {client.name}</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Valid Until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input-nawi" /></div>
              <div>
                <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium">Line Items</label><button onClick={() => setLineItems([...lineItems, { description: '', amount: 0 }])} className="btn-outline text-xs py-1"><Plus className="w-3 h-3" /> Add</button></div>
                {lineItems.map((li, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={li.description} onChange={(e) => { const u = [...lineItems]; u[i].description = e.target.value; setLineItems(u); }} className="input-nawi flex-1" placeholder="Description" />
                    <input type="number" value={li.amount || ''} onChange={(e) => { const u = [...lineItems]; u[i].amount = Number(e.target.value); setLineItems(u); }} className="input-nawi w-28" placeholder="Amount" />
                    {lineItems.length > 1 && <button onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Quoted Price</label><input value={quotedPrice} readOnly className="input-nawi bg-muted" /></div>
                <div><label className="block text-sm font-medium mb-1">Payable Amount</label><input type="number" value={payableAmount || ''} onChange={(e) => setPayableAmount(Number(e.target.value))} className="input-nawi" /></div>
              </div>
              <div className={`p-3 rounded-lg text-center font-bold font-display text-lg ${profit >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                Profit: {formatCurrency(profit)}
              </div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={quoNotes} onChange={(e) => setQuoNotes(e.target.value)} className="input-nawi" rows={2} /></div>
              <div className="flex gap-2">
                <button onClick={saveQuotation} className="btn-primary flex-1"><Save className="w-4 h-4" /> Save</button>
                <button onClick={generatePDF} className="btn-secondary flex-1"><Download className="w-4 h-4" /> Download PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PasswordConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Client"
        description={`This will permanently delete ${client.name} and all related services, quotations, and tasks. This cannot be undone.`}
        actionLabel="Delete Client"
      />

      <WhatsAppTemplateModal
        open={showWhatsApp}
        onClose={() => setShowWhatsApp(false)}
        mobile={client.mobile}
        defaultMessage={buildWelcomeMessage()}
        title={`Message ${client.name}`}
      />
    </div>
  );
}

// =============== Documents Tab ===============
function ProfileDocumentsTab({ documents, onAdd, onDelete }: { documents: any[]; onAdd: (file: File, name: string) => void; onDelete: (idx: number) => void; }) {
  const [pendingName, setPendingName] = useState('');
  const triggerUpload = (camera: boolean) => {
    if (!pendingName.trim()) { toast.error('Enter a document name first'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.multiple = true;
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = (e: any) => {
      const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
      files.forEach((file, i) => onAdd(file, files.length > 1 ? `${pendingName} (${i + 1})` : pendingName));
      setPendingName('');
    };
    input.click();
  };
  return (
    <div className="card-nawi">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold font-display">Documents ({documents.length})</h3>
      </div>
      <div className="card-nawi bg-muted/30 mb-4 space-y-3">
        <input value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="Document name (e.g. Passport Copy)" className="input-nawi" />
        <div className="flex gap-2">
          <button onClick={() => triggerUpload(false)} className="btn-outline flex-1"><Upload className="w-4 h-4" /> Upload</button>
          <button onClick={() => triggerUpload(true)} className="btn-outline flex-1"><Camera className="w-4 h-4" /> Take Photo</button>
        </div>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {documents.map((d: any, i: number) => {
            const isImage = d.fileType?.startsWith('image/') || d.type?.startsWith('image/') || d.fileName?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
            const src = d.base64?.startsWith('NAWI_ENC::') ? d.base64.replace('NAWI_ENC::', '') : d.base64;
            return (
              <div key={i} className="border border-border rounded-lg overflow-hidden relative group">
                {isImage && src ? (
                  <a href={src} target="_blank" rel="noopener"><img src={src} alt={d.name} className="w-full h-40 object-cover" /></a>
                ) : (
                  <div className="w-full h-40 bg-muted flex items-center justify-center"><FileText className="w-12 h-12 text-muted-foreground" /></div>
                )}
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{d.name || d.docType || d.fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.fileName}</p>
                  <div className="flex justify-between items-center mt-2">
                    {src && <a href={src} download={d.fileName || d.name} className="text-xs text-primary hover:underline"><Download className="w-3 h-3 inline" /> Download</a>}
                    <button onClick={() => onDelete(i)} className="text-xs text-destructive hover:underline"><Trash2 className="w-3 h-3 inline" /> Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============== Dates Tab ===============
function ProfileDatesTab({ dates, dateStatusColors, onAdd, onDelete }: { dates: Record<string, string>; dateStatusColors: Record<string, string>; onAdd: (name: string, date: string) => void; onDelete: (key: string) => void; }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  return (
    <div className="card-nawi">
      <h3 className="font-semibold font-display mb-4">Important Dates</h3>
      <div className="card-nawi bg-muted/30 mb-4 grid grid-cols-1 md:grid-cols-3 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Date name (Travel Date, Passport Expiry…)" className="input-nawi md:col-span-1" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-nawi" />
        <button onClick={() => { onAdd(name, date); setName(''); setDate(''); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Date</button>
      </div>
      {Object.keys(dates).filter(k => dates[k] && k !== 'passportNo').length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No dates added yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(dates).map(([type, val]) => {
            if (!val || type === 'passportNo') return null;
            const days = daysUntil(val as string);
            const status = getDateStatus(val as string);
            return (
              <div key={type} className={`p-4 rounded-xl border ${dateStatusColors[status]} relative group`}>
                <button onClick={() => onDelete(type)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 p-1 rounded transition"><Trash2 className="w-3 h-3" /></button>
                <p className="text-xs font-medium uppercase tracking-wider mb-1">{type.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-lg font-bold font-display">{formatDate(val as string)}</p>
                <p className="text-sm font-medium mt-1">{days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Today' : `${days} days left`}</p>
              </div>
            );
          }).filter(Boolean)}
        </div>
      )}
    </div>
  );
}
