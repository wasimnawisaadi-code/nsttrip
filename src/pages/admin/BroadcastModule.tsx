import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { exportToExcel } from '@/lib/excel-export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Filter, Download, MessageCircle, Users as UsersIcon, MessagesSquare, Briefcase, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

type SourceKey = 'clients' | 'leads' | 'dsr';

type Recipient = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  meta: Record<string, any>;
};

const MONTHS = [
  '01','02','03','04','05','06','07','08','09','10','11','12',
];

export default function BroadcastModule() {
  const { user } = useAuth();
  const [source, setSource] = useState<SourceKey>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [dsr, setDsr] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [nationality, setNationality] = useState('all');
  const [service, setService] = useState('all');
  const [clientType, setClientType] = useState('all');
  const [status, setStatus] = useState('all');
  const [leadSource, setLeadSource] = useState('all');
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');

  // Message
  const [template, setTemplate] = useState('Hi {name}, this is Nawi Saadi Travel & Tourism. ');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, l, d] = await Promise.all([
        supabase.from('clients').select('id, display_id, name, mobile, email, nationality, service, client_type, status, lead_source, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('social_leads').select('id, display_id, full_name, phone, source, status, client_need, assigned_to, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('dsr_entries').select('id, display_id, employee_name, employee_id, entry_date, data, sale_amount, profit_amount, template_key').order('entry_date', { ascending: false }).limit(2000),
      ]);
      setClients(c.data || []);
      setLeads(l.data || []);
      setDsr(d.data || []);
      setLoading(false);
    })();
  }, []);

  const filterOptions = useMemo(() => {
    const nationalities = new Set<string>();
    const services = new Set<string>();
    const clientTypes = new Set<string>();
    const statuses = new Set<string>();
    const sources = new Set<string>();
    const years = new Set<string>();

    if (source === 'clients') {
      clients.forEach(c => {
        c.nationality && nationalities.add(c.nationality);
        c.service && services.add(c.service);
        c.client_type && clientTypes.add(c.client_type);
        c.status && statuses.add(c.status);
        c.lead_source && sources.add(c.lead_source);
        c.created_at && years.add(c.created_at.slice(0, 4));
      });
    } else if (source === 'leads') {
      leads.forEach(l => {
        l.source && sources.add(l.source);
        l.status && statuses.add(l.status);
        l.created_at && years.add(l.created_at.slice(0, 4));
      });
    } else {
      dsr.forEach(d => {
        d.template_key && services.add(d.template_key);
        d.entry_date && years.add(d.entry_date.slice(0, 4));
      });
    }
    return {
      nationalities: Array.from(nationalities).sort(),
      services: Array.from(services).sort(),
      clientTypes: Array.from(clientTypes).sort(),
      statuses: Array.from(statuses).sort(),
      sources: Array.from(sources).sort(),
      years: Array.from(years).sort().reverse(),
    };
  }, [source, clients, leads, dsr]);

  const recipients: Recipient[] = useMemo(() => {
    const matchesDate = (iso?: string) => {
      if (!iso) return month === 'all' && year === 'all';
      const [y, m] = iso.split('-');
      if (year !== 'all' && y !== year) return false;
      if (month !== 'all' && m !== month) return false;
      return true;
    };

    if (source === 'clients') {
      return clients.filter(c => {
        if (search && !`${c.name} ${c.mobile} ${c.email} ${c.display_id}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (nationality !== 'all' && c.nationality !== nationality) return false;
        if (service !== 'all' && c.service !== service) return false;
        if (clientType !== 'all' && c.client_type !== clientType) return false;
        if (status !== 'all' && c.status !== status) return false;
        if (leadSource !== 'all' && c.lead_source !== leadSource) return false;
        if (!matchesDate(c.created_at?.split('T')[0])) return false;
        return c.mobile;
      }).map(c => ({
        id: c.id, name: c.name, phone: c.mobile, email: c.email,
        meta: { type: 'Client', display_id: c.display_id, nationality: c.nationality, service: c.service, status: c.status },
      }));
    }
    if (source === 'leads') {
      return leads.filter(l => {
        if (search && !`${l.full_name} ${l.phone} ${l.display_id}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (leadSource !== 'all' && l.source !== leadSource) return false;
        if (status !== 'all' && l.status !== status) return false;
        if (!matchesDate(l.created_at?.split('T')[0])) return false;
        return l.phone;
      }).map(l => ({
        id: l.id, name: l.full_name || 'Lead', phone: l.phone, email: '',
        meta: { type: 'Lead', display_id: l.display_id, source: l.source, status: l.status, need: l.client_need },
      }));
    }
    // DSR — group by passenger phone if column exists
    return dsr.filter(d => {
      if (service !== 'all' && d.template_key !== service) return false;
      if (!matchesDate(d.entry_date)) return false;
      return true;
    }).map(d => {
      const data = d.data || {};
      const phone = data.passenger_phone || data.phone || data.mobile || data.contact || '';
      const name = data.passenger_name || data.client_name || data.name || d.employee_name || 'DSR';
      return {
        id: d.id, name, phone, email: data.email || '',
        meta: { type: 'DSR', display_id: d.display_id, employee: d.employee_name, date: d.entry_date, sale: d.sale_amount, profit: d.profit_amount },
      };
    }).filter(r => r.phone);
  }, [source, clients, leads, dsr, search, nationality, service, clientType, status, leadSource, month, year]);

  const exportCSV = () => {
    if (recipients.length === 0) { toast.error('No recipients to export'); return; }
    const rows = recipients.map(r => ({
      Name: r.name, Phone: r.phone, Email: r.email || '',
      ...r.meta,
    }));
    exportToExcel(rows, `broadcast_${source}_${new Date().toISOString().split('T')[0]}`, source);
    toast.success(`Exported ${rows.length} contacts`);
  };

  const buildMessage = (r: Recipient) => template.replace(/\{name\}/g, r.name || 'there').replace(/\{phone\}/g, r.phone || '');

  const sendOne = (r: Recipient) => {
    const phone = (r.phone || '').replace(/[^0-9]/g, '');
    if (!phone) { toast.error('Invalid phone'); return; }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(r))}`;
    window.open(url, '_blank');
  };

  const sendAll = () => {
    if (recipients.length === 0) { toast.error('No recipients'); return; }
    if (recipients.length > 20 && !confirm(`Open ${recipients.length} WhatsApp tabs? Browsers may throttle/block this.`)) return;
    recipients.forEach((r, i) => setTimeout(() => sendOne(r), i * 400));
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Megaphone className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold font-display">Broadcast Center</h1>
          <p className="text-sm text-muted-foreground">Filter contacts across Clients, Leads & DSR — message via WhatsApp or export to Excel</p>
        </div>
      </div>

      <Tabs value={source} onValueChange={(v) => setSource(v as SourceKey)}>
        <TabsList>
          <TabsTrigger value="clients" className="gap-2"><Briefcase className="h-3.5 w-3.5" />Clients</TabsTrigger>
          <TabsTrigger value="leads" className="gap-2"><MessagesSquare className="h-3.5 w-3.5" />Social Leads</TabsTrigger>
          <TabsTrigger value="dsr" className="gap-2"><ClipboardList className="h-3.5 w-3.5" />DSR Entries</TabsTrigger>
        </TabsList>

        <TabsContent value={source} className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" />Advanced Filters</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div><Label className="text-xs">Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone, ID" /></div>

              {source === 'clients' && (
                <>
                  <FilterSelect label="Nationality" value={nationality} onChange={setNationality} options={filterOptions.nationalities} />
                  <FilterSelect label="Service" value={service} onChange={setService} options={filterOptions.services} />
                  <FilterSelect label="Client Type" value={clientType} onChange={setClientType} options={filterOptions.clientTypes} />
                  <FilterSelect label="Status" value={status} onChange={setStatus} options={filterOptions.statuses} />
                  <FilterSelect label="Lead Source" value={leadSource} onChange={setLeadSource} options={filterOptions.sources} />
                </>
              )}
              {source === 'leads' && (
                <>
                  <FilterSelect label="Source" value={leadSource} onChange={setLeadSource} options={filterOptions.sources} />
                  <FilterSelect label="Status" value={status} onChange={setStatus} options={filterOptions.statuses} />
                </>
              )}
              {source === 'dsr' && (
                <FilterSelect label="Template" value={service} onChange={setService} options={filterOptions.services} />
              )}

              <div>
                <Label className="text-xs">Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {filterOptions.years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageCircle className="h-4 w-4" />WhatsApp Message Template</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea rows={3} value={template} onChange={e => setTemplate(e.target.value)} placeholder="Use {name} for personalization" />
              <p className="text-xs text-muted-foreground">Tokens: <code className="bg-muted px-1 rounded">{'{name}'}</code> <code className="bg-muted px-1 rounded">{'{phone}'}</code></p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm"><UsersIcon className="h-3.5 w-3.5 mr-1" />{recipients.length} recipients</Badge>
              {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCSV} disabled={recipients.length === 0}><Download className="h-4 w-4 mr-1" />Export Excel</Button>
              <Button onClick={sendAll} disabled={recipients.length === 0}><MessageCircle className="h-4 w-4 mr-1" />Send via WhatsApp</Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-4">
              {recipients.length === 0 ? <div className="text-center py-8 text-muted-foreground">No matching recipients with phone numbers</div>
                : (
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0"><tr className="text-xs text-muted-foreground">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Phone</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Details</th>
                        <th className="p-2"></th>
                      </tr></thead>
                      <tbody>
                        {recipients.slice(0, 200).map(r => (
                          <tr key={r.id} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{r.name}</td>
                            <td className="p-2 font-mono text-xs">{r.phone}</td>
                            <td className="p-2"><Badge variant="outline" className="text-xs">{r.meta.type}</Badge></td>
                            <td className="p-2 text-xs text-muted-foreground truncate max-w-[280px]">
                              {Object.entries(r.meta).filter(([k]) => k !== 'type').map(([k, v]) => `${k}: ${v}`).join(' • ')}
                            </td>
                            <td className="p-2">
                              <Button size="sm" variant="ghost" onClick={() => sendOne(r)}><MessageCircle className="h-3.5 w-3.5" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {recipients.length > 200 && <p className="text-xs text-muted-foreground text-center py-2">Showing first 200 of {recipients.length} — export to see all</p>}
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
