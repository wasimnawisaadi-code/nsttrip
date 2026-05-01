import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Lock, Save, User as UserIcon, Mail, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function UserProfile() {
  const { user, profile, role, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify old password by attempting a re-authentication
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: oldPassword,
      });

      if (signInError) {
        toast.error('Current password incorrect');
        setLoading(false);
        return;
      }

      // 2. Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      toast.success('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <UserIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account and security settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Info */}
        <div className="md:col-span-1 space-y-6">
          <div className="card-nawi flex flex-col items-center text-center p-6">
            <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-3xl font-bold text-primary-foreground mb-4 shadow-elevated">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)
              )}
            </div>
            <h2 className="text-lg font-bold">{profile.name}</h2>
            <p className="text-xs text-muted-foreground capitalize mb-2">{role}</p>
            <div className="px-3 py-1 rounded-full bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider">
              {profile.status}
            </div>
          </div>

          <div className="card-nawi space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 border-b border-border pb-2">
              <Mail className="w-4 h-4 text-primary" /> Contact Details
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Email</label>
                <p className="text-sm truncate">{profile.email}</p>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Mobile</label>
                <p className="text-sm">{profile.mobile || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Security & Settings */}
        <div className="md:col-span-2 space-y-6">
          <div className="card-nawi">
            <h3 className="text-lg font-bold font-display flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-primary" /> Security Settings
            </h3>
            
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" /> Change Password
                </h4>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Current Password</label>
                    <input 
                      type="password" 
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="input-nawi"
                      placeholder="Enter your current password"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">New Password</label>
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input-nawi"
                        placeholder="Min 6 chars"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Confirm New Password</label>
                      <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input-nawi"
                        placeholder="Repeat new password"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> 
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="card-nawi">
            <h3 className="text-lg font-bold font-display flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary" /> Assigned Workplace
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your login location is restricted to your assigned zone.
            </p>
            {profile.assigned_zone_id ? (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium text-primary">Geofence Enforced</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You are assigned to a specific workplace zone. Please ensure your location services are enabled.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <p className="text-sm font-medium text-muted-foreground">No specific zone assigned</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can log in from any location.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
