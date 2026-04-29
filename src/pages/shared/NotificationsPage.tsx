import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/supabase-service';
import { Bell, CheckCheck, Trash2, Filter } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

const TYPE_LABELS: Record<string, string> = {
  all: 'All',
  morning_summary: '☀️ Summary',
  passport_expiry: 'Passport',
  visa_expiry: 'Visa',
  travel_date: 'Travel',
  birthday: 'Birthday',
  chat: 'Chat',
  general: 'General',
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  };
  useEffect(() => { load(); }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    load();
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm('Delete all notifications? This cannot be undone.')) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    load();
  };

  const deleteOne = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    load();
  };

  const types = useMemo(() => {
    const set = new Set<string>(['all']);
    notifications.forEach(n => set.add(n.type || 'general'));
    return Array.from(set);
  }, [notifications]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => (n.type || 'general') === filter);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold font-display">Notifications</h2>
          <p className="text-xs text-muted-foreground">{unreadCount} unread · {notifications.length} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={markAllRead} className="btn-outline text-sm"><CheckCheck className="w-4 h-4" /> Mark all read</button>
          <button onClick={clearAll} className="btn-outline text-sm text-destructive border-destructive/30 hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Clear all</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Bell className="w-8 h-8 text-muted-foreground" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {filtered.map((n: any) => (
            <div key={n.id} className={`card-nawi flex items-start gap-3 group ${!n.is_read ? 'border-secondary/50 bg-secondary/5' : ''}`}>
              <Bell className={`w-5 h-5 mt-0.5 flex-shrink-0 ${!n.is_read ? 'text-secondary' : 'text-muted-foreground'}`} />
              <div className="flex-1 cursor-pointer" onClick={async () => {
                if (!n.is_read) { await supabase.from('notifications').update({ is_read: true }).eq('id', n.id); load(); }
              }}>
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
              </div>
              <button onClick={() => deleteOne(n.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-opacity">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
