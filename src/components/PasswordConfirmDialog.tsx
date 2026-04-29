import { useState } from 'react';
import { Lock, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  actionLabel?: string;
  destructive?: boolean;
}

/**
 * Reusable password re-authentication modal.
 * Verifies current user's password before running a destructive action.
 */
export default function PasswordConfirmDialog({
  open, onClose, onConfirm,
  title = 'Confirm with Password',
  description = 'For your security, please re-enter your password to continue.',
  actionLabel = 'Confirm',
  destructive = true,
}: Props) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setLoading(false);
    if (error) {
      toast.error('Incorrect password');
      return;
    }
    setPassword('');
    await onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-elevated w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold font-display">{title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Account: {user?.email}</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-nawi"
              placeholder="Enter your password"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button
              type="submit"
              disabled={loading || !password}
              className={destructive ? 'btn-danger' : 'btn-primary'}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {actionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
