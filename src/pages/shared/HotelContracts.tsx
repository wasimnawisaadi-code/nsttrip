import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, FileText, Download, Star, Trash2, Hotel, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { auditLog } from '@/lib/supabase-service';

interface HotelContract {
  id: string;
  name: string;
  type: 'inbound' | 'outbound';
  doc_url: string | null;
  info: string | null;
  rating: number;
  created_at: string;
}

export default function HotelContracts() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<HotelContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // New form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'inbound' | 'outbound'>('inbound');
  const [newInfo, setNewInfo] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [newFile, setNewFile] = useState<File | null>(null);

  const fetchContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hotel_contracts' as any)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error) setContracts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleSave = async () => {
    if (!newName) {
      toast.error('Hotel Name is required');
      return;
    }

    setSaving(true);
    try {
      let docUrl = null;

      if (newFile) {
        const fileExt = newFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(`hotel_contracts/${fileName}`, newFile);
        
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(uploadData.path);
        docUrl = publicUrl;
      }

      const { error } = await supabase.from('hotel_contracts' as any).insert({
        name: newName,
        type: newType,
        info: newInfo,
        rating: newRating,
        doc_url: docUrl,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success('Hotel Contract saved');
      await auditLog('hotel_contract_created', 'hotel_contracts', newName, { type: newType });
      
      // Reset form
      setNewName('');
      setNewType('inbound');
      setNewInfo('');
      setNewRating(5);
      setNewFile(null);
      setShowAdd(false);
      fetchContracts();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the contract for ${name}?`)) return;

    const { error } = await supabase.from('hotel_contracts' as any).delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Deleted');
      fetchContracts();
    }
  };

  const filtered = contracts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.info && c.info.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display flex items-center gap-2">
            <Hotel className="w-6 h-6 text-primary" />
            Hotel Contracts
          </h2>
          <p className="text-sm text-muted-foreground">Manage and search hotel partnership agreements (Inbound & Outbound)</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          {showAdd ? 'Close Form' : 'New Contract'}
        </Button>
      </div>

      {showAdd && (
        <div className="card-nawi p-6 border-primary/20 bg-primary/[0.02] animate-in slide-in-from-top-4 duration-300">
          <h3 className="font-bold font-display mb-4">Add New Hotel Contract</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hotelName">Hotel Name *</Label>
                <Input id="hotelName" placeholder="Enter hotel name" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contract Category</Label>
                <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">
                      <div className="flex items-center gap-2"><ArrowDownLeft className="w-3 h-3 text-success" /> Inbound</div>
                    </SelectItem>
                    <SelectItem value="outbound">
                      <div className="flex items-center gap-2"><ArrowUpRight className="w-3 h-3 text-secondary" /> Outbound</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rating ({newRating} Stars)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setNewRating(s)} className="focus:outline-none">
                      <Star className={`w-6 h-6 ${s <= newRating ? 'fill-warning text-warning' : 'text-muted'}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Contract Document (PDF/PDF based Image)</Label>
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setNewFile(e.target.files?.[0] || null)} className="cursor-pointer" />
                <p className="text-[10px] text-muted-foreground">Upload the official signed contract document.</p>
              </div>
              <div className="space-y-2">
                <Label>Key Info / Notes</Label>
                <Textarea placeholder="Enter key info, contact person, base price, etc." value={newInfo} onChange={e => setNewInfo(e.target.value)} rows={4} />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-success hover:bg-success/90 text-white min-w-[120px]">
              {saving ? 'Saving...' : 'Save Contract'}
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search by hotel name or info..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9 bg-card shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-48 skeleton-nawi" />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            No contracts found.
          </div>
        ) : filtered.map(c => (
          <div key={c.id} className="card-nawi group hover:border-primary/30 transition-all duration-300">
            <div className="flex justify-between items-start mb-3">
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${c.type === 'inbound' ? 'bg-success/10 text-success' : 'bg-secondary/10 text-secondary'}`}>
                {c.type === 'inbound' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {c.type}
              </div>
              <button 
                onClick={() => handleDelete(c.id, c.name)}
                className="opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <h4 className="font-bold text-lg leading-tight mb-1">{c.name}</h4>
            
            <div className="flex gap-0.5 mb-3">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`w-3.5 h-3.5 ${s <= c.rating ? 'fill-warning text-warning' : 'text-muted'}`} />
              ))}
            </div>

            <p className="text-sm text-muted-foreground line-clamp-3 mb-4 h-15 italic">
              {c.info || 'No key info provided.'}
            </p>

            <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
              {c.doc_url ? (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-2" asChild>
                  <a href={c.doc_url} target="_blank" rel="noreferrer">
                    <Download className="w-3 h-3" /> View Contract
                  </a>
                </Button>
              ) : (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" /> No Document
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
