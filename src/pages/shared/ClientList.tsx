import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/excel-export';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, LayoutGrid, LayoutList, Briefcase, Filter, Download, MessageCircle, Trash2, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { fetchPaginated } from '@/lib/dsr-service';
import { formatCurrency, formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function ClientList({ adminView = false }: { adminView?: boolean }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const { profile } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      const qMod = (q: any) => q.order('created_at', { ascending: false });
      const [cData, pData] = await Promise.all([
        fetchPaginated('clients', qMod, 100000),
        fetchPaginated('profiles')
      ]);
      setClients(cData || []);
      setProfiles(pData || []);
    };
    fetchData();
  }, []);

  const services = [...new Set(clients.map(c => c.service).filter(Boolean))];
  const nationalities = [...new Set(clients.map(c => c.nationality || (c.service_details as any)?.nationality).filter(Boolean))];
  const months = [...new Set(clients.map(c => c.created_at?.substring(0, 7)).filter(Boolean))].sort().reverse();
  const leadSources = [...new Set(clients.map(c => c.lead_source).filter(Boolean))];

  const filtered = clients.filter(c => {
    if (serviceFilter !== 'all' && c.service !== serviceFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (leadFilter !== 'all' && c.lead_source !== leadFilter) return false;
    if (nationalityFilter !== 'all' && (c.nationality || (c.service_details as any)?.nationality) !== nationalityFilter) return false;
    if (monthFilter !== 'all' && !c.created_at?.startsWith(monthFilter)) return false;
    if (employeeFilter !== 'all' && c.assigned_to !== employeeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name?.toLowerCase().includes(q) || c.display_id?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.passport_no?.toLowerCase().includes(q);
    }
    return true;
  });

  const basePath = isAdmin ? '/admin' : '/employee';
  const getEmpName = (userId: string) => profiles.find(p => p.user_id === userId)?.name || '—';

  const exportCSV = () => {
    const rows = filtered.map(c => ({ ID: c.display_id, Name: c.name, Mobile: c.mobile, Service: c.service, Status: c.status, LeadSource: c.lead_source, Revenue: c.revenue || 0, Profit: c.profit || 0, Created: formatDate(c.created_at) }));
    exportToExcel(rows, 'clients_export', 'Clients');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(c => c.id));
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;
    setShowDeleteModal(true);
  };

  const finalizeDelete = async () => {
    if (confirmEmail !== profile?.email) {
      toast.error('Email verification failed. Please enter your correct email.');
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(`Successfully deleted ${selectedIds.length} clients`);
      setClients(prev => prev.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      setShowDeleteModal(false);
      setConfirmEmail('');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search..." />
          </div>
          <div className="flex gap-2">
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="input-nawi w-1/2 sm:w-auto text-sm">
            <option value="all">All Services</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi w-1/2 sm:w-auto text-sm">
              <option value="all">All Status</option>
              <option value="New">New</option><option value="Processing">Processing</option><option value="Success">Success</option><option value="Failed">Failed</option>
            </select>
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="btn-outline text-destructive border-destructive hover:bg-destructive hover:text-white flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete ({selectedIds.length})</span>
            </button>
          )}
          <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /></button>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`p-1.5 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutList className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('card')} className={`p-1.5 ${viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="w-4 h-4" /></button>
          </div>
          <button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {adminView && (
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input-nawi w-full sm:w-auto text-sm">
            <option value="all">All Employees</option>
            {profiles.map(e => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
          </select>
        )}
        <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="input-nawi w-full sm:w-auto text-sm">
          <option value="all">All Sources</option>
          {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {nationalities.length > 0 && (
          <select value={nationalityFilter} onChange={(e) => setNationalityFilter(e.target.value)} className="input-nawi w-full sm:w-auto text-sm">
            <option value="all">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <span className="text-sm text-muted-foreground self-center ml-auto">{filtered.length} clients</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Briefcase className="w-8 h-8 text-muted-foreground" />} title="No clients found" description="Add your first client to get started." action={<button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>} />
      ) : viewMode === 'table' ? (
        <div className="table-container">
          <table className="table-nawi w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <button onClick={toggleSelectAll} className="p-1 hover:bg-muted rounded">
                    {selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Service</th>
                <th>Status</th>
                <th>Source</th>
                <th>Assigned</th>
                <th>Created</th>
                <th>Revenue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className={`cursor-pointer transition-colors ${selectedIds.includes(c.id) ? 'bg-primary/5' : ''}`}
                  onClick={() => navigate(`${basePath}/clients/${c.id}`)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(c.id)} className="p-1 hover:bg-muted rounded">
                      {selectedIds.includes(c.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="font-mono text-xs">{c.display_id}</td>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.mobile}</td>
                  <td><span className="text-xs">{c.service || '—'}</span></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="text-xs">{c.lead_source || '—'}</td>
                  <td className="text-xs">{getEmpName(c.assigned_to)}</td>
                  <td className="text-xs">{formatDate(c.created_at)}</td>
                  <td className="text-xs">{formatCurrency(c.revenue || 0)}</td>
                  <td className="flex gap-1">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    {(c.status === 'New' || c.status === 'Processing') && c.mobile && (
                      <button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${c.mobile.replace(/[^0-9]/g, '')}?text=Dear ${c.name},%0AThis is a follow-up regarding your ${c.service || 'service'} enquiry with Nawi Saadi Travel %26 Tourism.%0APlease let us know if you need any updates.%0ARegards`, '_blank'); }} className="text-success hover:text-success/80" title="WhatsApp Follow-up">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div
              key={c.id}
              className={`card-nawi-hover relative flex flex-col ${selectedIds.includes(c.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
            >
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(c.id); }}
                  className="p-1 bg-background/80 backdrop-blur rounded hover:bg-muted shadow-sm"
                >
                  {selectedIds.includes(c.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
              <Link to={`${basePath}/clients/${c.id}`} className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div className="pr-8"><p className="font-medium">{c.name}</p><p className="font-mono text-xs text-muted-foreground">{c.display_id}</p></div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>{c.service || 'No service'} • {c.lead_source}</p>
                  <p>{c.mobile}</p>
                  <p className="font-medium text-foreground">{formatCurrency(c.revenue || 0)}</p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Confirm Bulk Deletion
            </DialogTitle>
            <DialogDescription>
              You are about to delete <strong>{selectedIds.length}</strong> client profiles. This operation is permanent and cannot be reversed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-confirm">To confirm, type your admin email: <span className="font-mono text-[10px] text-muted-foreground">({profile?.email})</span></Label>
              <Input
                id="email-confirm"
                placeholder="Enter your email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={finalizeDelete}
              disabled={isDeleting || confirmEmail !== profile?.email}
            >
              {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
