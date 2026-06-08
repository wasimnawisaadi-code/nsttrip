import { useState, useEffect } from 'react';
import { 
  Key, Plus, Search, Eye, EyeOff, Edit, Trash2, 
  Globe, Shield, Smartphone, Lock, Copy, Check, ExternalLink,
  ChevronRight, MoreVertical, Filter, Loader2, AlertCircle, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';

interface PasswordEntry {
  id: string;
  service_name: string;
  username: string;
  password?: string;
  url?: string;
  category: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  'All',
  'Social Media',
  'B2B Portals',
  'Websites',
  'Confidential',
  'Software',
  'Email',
  'Others'
];

export default function PasswordManager() {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  
  // Security states
  const [revealId, setRevealId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [securityAction, setSecurityAction] = useState<(() => void) | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  
  // Captcha states
  const [captchaValue, setCaptchaValue] = useState<{a: number, b: number, total: number} | null>(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('password_entries')
        .select('*')
        .order('service_name', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (error: any) {
      toast.error('Failed to load password entries: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    setCaptchaValue({ a, b, total: a + b });
    setCaptchaInput('');
    setShowCaptcha(true);
  };


  const verifyCaptchaAndProceed = () => {
    if (parseInt(captchaInput) === captchaValue?.total) {
      setShowCaptcha(false);
      securityAction?.();
    } else {
      toast.error('Incorrect captcha. Please try again.');
      generateCaptcha();
    }
  };

  const handleRevealPassword = (id: string) => {
    if (revealedPasswords[id]) {
      const newRevealed = { ...revealedPasswords };
      delete newRevealed[id];
      setRevealedPasswords(newRevealed);
      return;
    }

    setRevealId(id);
    setSecurityAction(() => actuallyRevealPassword);
    setShowConfirmDialog(true);
  };

  const actuallyRevealPassword = async () => {
    if (!revealId) return;
    try {
      const { data, error } = await supabase
        .from('password_entries')
        .select('password')
        .eq('id', revealId)
        .single();

      if (error) throw error;
      setRevealedPasswords(prev => ({ ...prev, [revealId]: data.password || '' }));
    } catch (error: any) {
      toast.error('Failed to reveal password: ' + error.message);
    } finally {
      setRevealId(null);
    }
  };

  const handleDelete = (id: string) => {
    setRevealId(id);
    setSecurityAction(() => async () => {
        try {
            const { error } = await supabase.from('password_entries').delete().eq('id', id);
            if (error) throw error;
            toast.success('Entry deleted successfully');
            fetchEntries();
        } catch (error: any) {
            toast.error('Failed to delete: ' + error.message);
        }
    });
    setShowConfirmDialog(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = 
      entry.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || entry.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Social Media': return <smartphone className="w-4 h-4" />;
      case 'B2B Portals': return <Globe className="w-4 h-4" />;
      case 'Websites': return <Globe className="w-4 h-4" />;
      case 'Confidential': return <Shield className="w-4 h-4" />;
      default: return <Key className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Lock className="w-6 h-6" />
            </div>
            Secure Password Manager
          </h1>
          <p className="text-muted-foreground mt-1">Manage company portals, social media, and confidential credentials.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          Add New Credential
        </button>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-card/50 p-4 rounded-2xl border border-border/50 backdrop-blur-sm">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search service, username, or notes..." 
            className="input-nawi pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div>
          <select 
            className="input-nawi"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end">
          <button 
            onClick={fetchEntries}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
          <p>Decrypting secure vault...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No credentials found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEntries.map((entry) => (
            <div 
              key={entry.id}
              className="bg-card hover:bg-card/80 border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
            >
              {/* Category Badge */}
              <div className="absolute top-0 right-0 p-3">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1.5">
                  {getCategoryIcon(entry.category)}
                  {entry.category}
                </span>
              </div>

              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 text-primary group-hover:scale-110 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <div className="pr-20">
                  <h3 className="font-bold text-lg font-display truncate">{entry.service_name}</h3>
                  {entry.url && (
                    <a 
                      href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"
                    >
                      {entry.url.replace(/(^\w+:|^)\/\//, '').split('/')[0]} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-muted/30 p-3 rounded-xl border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Username / Email</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium font-mono truncate">{entry.username}</span>
                    <button 
                      onClick={() => copyToClipboard(entry.username, 'Username')}
                      className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-xl border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Password</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 flex items-center gap-2 overflow-hidden">
                      {revealedPasswords[entry.id] ? (
                        <span className="text-sm font-bold font-mono text-primary animate-in fade-in slide-in-from-left-2">
                          {revealedPasswords[entry.id]}
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleRevealPassword(entry.id)}
                        className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-all"
                        title={revealedPasswords[entry.id] ? "Hide Password" : "View Password"}
                      >
                        {revealedPasswords[entry.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {revealedPasswords[entry.id] && (
                        <button 
                          onClick={() => copyToClipboard(revealedPasswords[entry.id], 'Password')}
                          className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-all"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {entry.notes && (
                <div className="mt-4 p-3 bg-card border border-border/50 rounded-xl">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Security Notes</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 italic">"{entry.notes}"</p>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Updated: {format(new Date(entry.updated_at), 'MMM d, yyyy')}
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                        setEditingEntry(entry);
                        setShowAddModal(true);
                    }}
                    className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg transition-all"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(entry.id)}
                    className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-lg rounded-3xl shadow-2xl p-6 border border-border/50 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold font-display flex items-center gap-2">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  {editingEntry ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                {editingEntry ? 'Edit Credential' : 'Add New Credential'}
              </h2>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data = Object.fromEntries(formData);
              
              setLoading(true);
              try {
                if (editingEntry) {
                    const { error } = await supabase
                        .from('password_entries')
                        .update(data as any)
                        .eq('id', editingEntry.id);
                    if (error) throw error;
                    toast.success('Credential updated');
                } else {
                    const { error } = await supabase
                        .from('password_entries')
                        .insert([data] as any);
                    if (error) throw error;
                    toast.success('Credential added successfully');
                }
                setShowAddModal(false);
                setEditingEntry(null);
                fetchEntries();
              } catch (error: any) {
                toast.error('Operation failed: ' + error.message);
              } finally {
                setLoading(false);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">Service Name</label>
                  <input name="service_name" defaultValue={editingEntry?.service_name} className="input-nawi" placeholder="e.g. Facebook, Gmail, B2B Portal" required />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">Category</label>
                  <select name="category" defaultValue={editingEntry?.category || 'Social Media'} className="input-nawi" required>
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">Username / Email</label>
                <input name="username" defaultValue={editingEntry?.username} className="input-nawi" placeholder="Enter username or email" required />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">Password</label>
                <input name="password" type="password" defaultValue={editingEntry?.password} className="input-nawi" placeholder="Enter secure password" required />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">URL / Website (Optional)</label>
                <input name="url" defaultValue={editingEntry?.url} className="input-nawi" placeholder="e.g. portal.flydubai.com" />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">Security Notes (Optional)</label>
                <textarea name="notes" defaultValue={editingEntry?.notes} className="input-nawi min-h-[80px]" placeholder="Add any special instructions or security notes..." />
              </div>

              <div className="flex gap-3 mt-8 pt-6 border-t border-border/50">
                <button type="button" onClick={() => {setShowAddModal(false); setEditingEntry(null);}} className="flex-1 btn-outline">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 btn-primary">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : editingEntry ? 'Save Changes' : 'Add Credential'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Captcha Modal */}
      {showCaptcha && (
        <div className="fixed inset-0 bg-foreground/70 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in zoom-in-95">
          <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl p-8 border border-border/50 text-center">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold font-display mb-2 text-foreground">Security Verification</h2>
            <p className="text-sm text-muted-foreground mb-8">Please solve this simple puzzle to prove you are an authorized administrator.</p>
            
            <div className="bg-muted p-6 rounded-2xl mb-6 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="text-3xl font-bold font-mono tracking-widest text-primary flex items-center justify-center gap-4">
                    <span className="bg-card px-3 py-1 rounded-lg border border-border shadow-sm">{captchaValue?.a}</span>
                    <span className="text-muted-foreground text-xl">+</span>
                    <span className="bg-card px-3 py-1 rounded-lg border border-border shadow-sm">{captchaValue?.b}</span>
                    <span className="text-muted-foreground text-xl">=</span>
                    <span className="text-muted-foreground text-xl">?</span>
                </div>
            </div>

            <input 
              type="number" 
              autoFocus
              className="input-nawi text-center text-2xl font-bold font-mono h-16 mb-6"
              placeholder="Result"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyCaptchaAndProceed()}
            />

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowCaptcha(false)} className="btn-outline">Cancel</button>
              <button 
                onClick={verifyCaptchaAndProceed}
                disabled={!captchaInput}
                className="btn-primary"
              >
                Verify & Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      <PasswordConfirmDialog 
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => {
            setShowConfirmDialog(false);
            generateCaptcha();
        }}
        title="Admin Security Check"
        description="This action requires additional authentication. Please enter your administrator password."
        destructive={false}
      />
    </div>
  );
}
