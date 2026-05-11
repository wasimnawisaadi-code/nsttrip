import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/supabase-service';
import { Bell, CheckCheck, Trash2, Filter, Eye, X } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);

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

  const refreshCounts = () => window.dispatchEvent(new CustomEvent('refresh-counts'));

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    if (error) toast.error('Failed to update');
    else { toast.success('All marked as read'); load(); refreshCounts(); }
  };

  const deleteRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id).eq('is_read', true);
    if (error) toast.error('Failed to delete');
    else { toast.success('Read notifications removed'); load(); refreshCounts(); }
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm('Delete all notifications? This cannot be undone.')) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    toast.success('All notifications deleted');
    load();
    refreshCounts();
  };

  const deleteOne = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    load();
    refreshCounts();
  };

  const openNotif = async (n: any) => {
    setSelectedNotif(n);
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      load();
      refreshCounts();
    }
  };

  const types = useMemo(() => {
    const set = new Set<string>(['all']);
    notifications.forEach(n => set.add(n.type || 'general'));
    return Array.from(set);
  }, [notifications]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => (n.type || 'general') === filter);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const readCount = notifications.length - unreadCount;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold font-display">Notifications</h2>
          <p className="text-xs text-muted-foreground">{unreadCount} unread · {notifications.length} total</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="btn-outline text-xs h-8 px-3">
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
            </button>
          )}
          {readCount > 0 && (
            <button onClick={deleteRead} className="btn-outline text-xs h-8 px-3 text-muted-foreground border-border/50">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove read
            </button>
          )}
          <button onClick={clearAll} className="btn-outline text-xs h-8 px-3 text-destructive border-destructive/30 hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear all
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-border/50">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filter === t ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Bell className="w-8 h-8 text-muted-foreground" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map((n: any) => (
            <div key={n.id} className={`card-nawi flex items-start gap-4 group cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md ${!n.is_read ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/5' : 'opacity-75'}`}
              onClick={() => openNotif(n)}>
              <div className={`p-2 rounded-lg mt-0.5 ${!n.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className={`text-sm font-bold truncate ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(n.created_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{n.message}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Detail Modal */}
      <Dialog open={!!selectedNotif} onOpenChange={(open) => !open && setSelectedNotif(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-full">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <DialogTitle className="text-base font-bold">{selectedNotif?.title}</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Received on {selectedNotif && formatDate(selectedNotif.created_at)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 border-y border-border/50 my-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedNotif?.message}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedNotif(null)}>Close</Button>
            <Button variant="destructive" size="sm" onClick={() => { deleteOne(selectedNotif.id); setSelectedNotif(null); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

