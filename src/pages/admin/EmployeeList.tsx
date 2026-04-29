import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Eye, Users, Camera, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { auditLog } from '@/lib/supabase-service';

import EmptyState from '@/components/ui/EmptyState';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { toast } from 'sonner';

export default function EmployeeList() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [pwdAction, setPwdAction] = useState<{ type: 'delete'; emp: any } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    name: '', mobile: '', email: '', password: '',
    passportNo: '', emiratesId: '', photo: '', makeAdmin: false,
  });

  const [adminMap, setAdminMap] = useState<Record<string, 'admin' | 'superadmin'>>({});
  const load = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const map: Record<string, 'admin' | 'superadmin'> = {};
    (roles || []).forEach((r: any) => {
      if (r.role === 'superadmin') map[r.user_id] = 'superadmin';
      else if (r.role === 'admin' && map[r.user_id] !== 'superadmin') map[r.user_id] = 'admin';
    });
    setAdminMap(map);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    // Show admins too — sorted to top — but render them as read-only Admin cards
    const list = (data || []).slice().sort((a: any, b: any) => {
      const aAdmin = !!map[a.user_id], bAdmin = !!map[b.user_id];
      if (aAdmin && !bAdmin) return -1;
      if (!aAdmin && bAdmin) return 1;
      return 0;
    });
    setEmployees(list);
  };
  useEffect(() => { load(); }, []);

  const filtered = employees.filter((e: any) => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.from('clients').select('assigned_to');
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => { if (c.assigned_to) counts[c.assigned_to] = (counts[c.assigned_to] || 0) + 1; });
      setClientCounts(counts);
    };
    fetchCounts();
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    let pwd = '';
    pwd += upper.charAt(Math.floor(Math.random() * upper.length));
    pwd += lower.charAt(Math.floor(Math.random() * lower.length));
    pwd += digits.charAt(Math.floor(Math.random() * digits.length));
    pwd += special.charAt(Math.floor(Math.random() * special.length));
    const all = upper + lower + digits + special;
    for (let i = 0; i < 8; i++) pwd += all.charAt(Math.floor(Math.random() * all.length));
    pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setForm({ ...form, password: pwd });
  };

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(form.email)) { alert('Please enter a valid email address'); return; }
    if (form.password.length < 8) { alert('Password must be at least 8 characters'); return; }

    // Create auth user via Supabase admin (we use signUp which will auto-create profile via trigger)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } }
    });

    if (authError) { alert(authError.message); return; }
    if (!authData.user) { alert('Failed to create user'); return; }

    // Update profile with additional details
    await supabase.from('profiles').update({
      name: form.name,
      mobile: form.mobile,
      passport_no: form.passportNo || null,
      emirates_id: form.emiratesId || null,
      photo_url: form.photo || null,
    }).eq('user_id', authData.user.id);

    // Assign role — admins only when superadmin enabled the toggle
    const role = (isSuperAdmin && form.makeAdmin) ? 'admin' : 'employee';
    await supabase.from('user_roles').insert([{ user_id: authData.user.id, role: role as any }]);

    await auditLog(role === 'admin' ? 'admin_created' : 'employee_created', 'employee', authData.user.id, { name: form.name, role });
    setShowCreateForm(false);
    setForm({ name: '', mobile: '', email: '', password: '', passportNo: '', emiratesId: '', photo: '', makeAdmin: false });
    load();
  };

  const runPwdAction = async () => {
    if (!pwdAction) return;
    const { emp } = pwdAction;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ user_id: emp.user_id }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Delete failed'); return; }
    await auditLog('employee_deleted', 'employee', emp.user_id, { name: emp.name });
    toast.success(`${emp.name} permanently deleted`);
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search employees..." />
          </div>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No employees yet" description="Add your first employee to get started." action={<button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e: any) => {
            const clientCount = clientCounts[e.user_id] || 0;
            return (
              <div key={e.id} className="card-nawi-hover cursor-pointer" onClick={() => navigate(`/admin/employees/${e.user_id}`)}>
                <div className="flex items-start gap-3">
                  {e.photo_url ? (
                    <img src={e.photo_url} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-lg font-bold text-primary-foreground flex-shrink-0">
                      {e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">{e.name}</p>
                      {adminMap[e.user_id] && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> {adminMap[e.user_id] === 'superadmin' ? 'SUPERADMIN' : 'ADMIN'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{e.user_id?.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{e.email}</p>
                    <p className="text-xs text-muted-foreground">{e.mobile}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{clientCount} clients</span>
                      <div className="flex items-center gap-1">
                        <button title="View" onClick={(ev) => { ev.stopPropagation(); navigate(`/admin/employees/${e.user_id}`); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                        {!adminMap[e.user_id] && (
                          <button title="Delete permanently" onClick={(ev) => { ev.stopPropagation(); setPwdAction({ type: 'delete', emp: e }); }} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground font-display mb-4">Add New Employee</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex justify-center">
                <label className="relative cursor-pointer">
                  {form.photo ? (
                    <img src={form.photo} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-border" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border-4 border-border">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <Camera className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Mobile *</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-nawi" required /></div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <div className="flex gap-2">
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-nawi flex-1" required minLength={8} />
                    <button type="button" onClick={generatePassword} className="btn-outline text-xs whitespace-nowrap"><Shield className="w-3 h-3" /> Generate</button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Min 8 chars with uppercase, lowercase, number & special char</p>
                </div>
                <div><label className="block text-sm font-medium mb-1">Passport No.</label><input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Emirates ID</label><input value={form.emiratesId} onChange={(e) => setForm({ ...form, emiratesId: e.target.value })} className="input-nawi" /></div>
              </div>

              {isSuperAdmin && (
                <label className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.makeAdmin}
                    onChange={(e) => setForm({ ...form, makeAdmin: e.target.checked })}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Shield className="w-4 h-4" /> Create as Admin
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Admins have full access to all clients, employees, payroll & settings. Only the original superadmin can create other admins.
                    </p>
                  </div>
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">
                  {isSuperAdmin && form.makeAdmin ? 'Create Admin' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        onConfirm={runPwdAction}
        title={pwdAction ? `Delete ${pwdAction.emp.name}` : ''}
        description={pwdAction ? `This will PERMANENTLY delete the employee, their login, and unassign ${clientCounts[pwdAction.emp.user_id] || 0} client(s). Cannot be undone.` : ''}
        actionLabel="Delete Permanently"
        destructive
      />
    </div>
  );
}
