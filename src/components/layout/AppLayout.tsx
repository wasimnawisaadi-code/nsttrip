import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText,
  DollarSign, Shield, LogOut, Menu,
  Search, ChevronLeft, Clock, PlaneTakeoff, MessageCircle, CalendarDays, Bell, MapPin,
  ClipboardList, Sparkles, MessagesSquare, Trophy, Megaphone, User as UserIcon
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
const logo = "/favicon.png";
import AIChatbot from '@/components/AIChatbot';
import HeaderCalculator from '@/components/HeaderCalculator';
import { openAIChatbot } from '@/lib/ai-chatbot-bus';

const adminLinks = [
  { to: '/admin/dashboard', label: 'Dashboard & Reports', icon: LayoutDashboard },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/performance', label: 'Performance', icon: Trophy },
  { to: '/admin/clients', label: 'Clients', icon: Briefcase },
  { to: '/admin/leads', label: 'Social Leads', icon: MessagesSquare },
  { to: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
  { to: '/admin/calendar', label: 'Calendar', icon: Calendar },
  { to: '/admin/important-dates', label: 'Important Dates', icon: CalendarDays },
  { to: '/admin/dsr', label: 'Daily Status', icon: ClipboardList },
  { to: '/admin/monitoring', label: 'Project Monitoring', icon: LayoutGrid },
  { to: '/admin/attendance', label: 'Attendance', icon: Clock },
  { to: '/admin/leave', label: 'Leave & HR', icon: FileText },
  { to: '/admin/payroll', label: 'Payroll', icon: DollarSign },
  { to: '/admin/geofence', label: 'Geofence Zones', icon: MapPin },
  { to: '/admin/audit-log', label: 'Audit Log', icon: Shield },
  { to: '/admin/chat', label: 'Team Chat', icon: MessageCircle },
  { to: '/admin/profile', label: 'My Profile', icon: Shield },
];

const employeeLinks = [
  { to: '/employee/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employee/clients', label: 'My Clients', icon: Briefcase },
  { to: '/employee/leads', label: 'Social Leads', icon: MessagesSquare },
  { to: '/employee/calendar', label: 'Calendar', icon: Calendar },
  { to: '/employee/important-dates', label: 'Important Dates', icon: CalendarDays },
  { to: '/employee/dsr', label: 'My Daily Status', icon: ClipboardList },
  { to: '/employee/performance', label: 'My Performance', icon: Trophy },
  { to: '/employee/attendance', label: 'Attendance', icon: Clock },
  { to: '/employee/leave', label: 'Leave', icon: FileText },
  { to: '/employee/chat', label: 'Team Chat', icon: MessageCircle },
  { to: '/employee/profile', label: 'My Profile', icon: UserIcon },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, isAdmin, isSuperAdmin, loading, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [dubaiTime, setDubaiTime] = useState('');
  const [workDuration, setWorkDuration] = useState<string | null>(null);

  // Accidental close prevention
  // Note: Modern browsers (Chrome/Firefox) do NOT allow custom text here for security.
  // They will show a standard "Changes you made may not be saved" message.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (user) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  // Live Dubai Clock (UTC+4)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Dubai is UTC+4
      const dubaiDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (4 * 3600000));
      setDubaiTime(dubaiDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Heartbeat: Update last_seen_at every 1 minute
  useEffect(() => {
    if (!user) return;
    
    // 1. Morning Reset & Daily Attendance Handshake
    const performHandshake = async () => {
      const { handleAttendanceHandshake } = await import('@/lib/supabase-service');
      await handleAttendanceHandshake(user.id);
    };
    performHandshake();

    // 2. Inactivity Watcher (Auto-Logout)
    let idleTimer: NodeJS.Timeout;
    const resetIdleTimer = async () => {
      clearTimeout(idleTimer);
      const { getAttendanceSettings } = await import('@/lib/settings');
      const settings = await getAttendanceSettings(user.id);
      const limit = settings.inactivity_logout_min || 0;
      
      if (limit > 0) {
        idleTimer = setTimeout(async () => {
          console.log('Inactivity limit reached. Auto-logging out...');
          // Record auto-logout status before signing out
          const today = new Date().toISOString().split('T')[0];
          await supabase.from('attendance').update({ 
            is_auto_logout: true,
            logout_time: new Date().toISOString()
          } as any).eq('employee_id', user.id).eq('date', today).is('logout_time', null);

          // Send Notification about the auto-logout
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: 'Auto-Logout Triggered',
            message: `You were automatically logged out after ${limit} minutes of inactivity.`,
            type: 'system',
            is_read: false
          });
          
          await signOut();
          navigate('/login');
        }, limit * 60 * 1000);
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer(); // Initial start

    // 3. Heartbeat
    const heartbeat = async () => {
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id);
    };
    heartbeat();
    const interval = setInterval(heartbeat, 60000);

    return () => { 
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      clearTimeout(idleTimer);
      clearInterval(interval);
    };
  }, [user]);

  // Fetch counts for notifications and chat
  useEffect(() => {
    if (!user) return;
    const fetchCounts = async () => {
      const { count: chatCount } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      setUnreadChats(chatCount || 0);

      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadNotifications(notifCount || 0);
    };
    fetchCounts();

    const channel = supabase
      .channel('notification-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        fetchCounts();
      })
      .subscribe();

    window.addEventListener('refresh-counts', fetchCounts);
    return () => { 
      supabase.removeChannel(channel); 
      window.removeEventListener('refresh-counts', fetchCounts);
    };
  }, [user]);

  // Live work duration clock
  useEffect(() => {
    if (!user) return;
    const fetchTodayAttendance = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendance')
        .select('login_time, logout_time, total_break_minutes')
        .eq('employee_id', user.id)
        .eq('date', today)
        .maybeSingle();
      
      if (data && data.login_time && !data.logout_time) {
        const updateWorkClock = () => {
          const login = new Date(data.login_time);
          const now = new Date();
          const breakMs = (data.total_break_minutes || 0) * 60000;
          const diffMs = (now.getTime() - login.getTime()) - breakMs;
          const hours = Math.floor(Math.max(0, diffMs) / 3600000);
          const minutes = Math.floor((Math.max(0, diffMs) % 3600000) / 60000);
          setWorkDuration(`${hours}h ${minutes}m`);
        };
        updateWorkClock();
        const interval = setInterval(updateWorkClock, 60000);
        return () => clearInterval(interval);
      } else {
        setWorkDuration(null);
      }
    };
    fetchTodayAttendance();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!user || !profile) return null;

  const links = isAdmin ? adminLinks : employeeLinks;

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); setShowSearch(false); return; }
    const { data } = await supabase
      .from('clients')
      .select('id, display_id, name, mobile, service')
      .or(`name.ilike.%${q}%,display_id.ilike.%${q}%,mobile.ilike.%${q}%,passport_no.ilike.%${q}%`)
      .limit(5);
    setSearchResults(data || []);
    setShowSearch(true);
  };

  const handleLogout = async () => { await signOut(); navigate('/login'); };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-all duration-200
        ${collapsed ? 'w-[72px]' : 'w-[260px]'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="NS" className="w-8 h-8 object-contain" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-foreground font-display truncate">Nawi Saadi CRM</h1>
              <p className="text-xs text-sidebar-muted">Travel & Tourism</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-sidebar-muted hover:text-sidebar-foreground hidden lg:block">
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {links.map((link) => {
            const active = location.pathname === link.to || location.pathname.startsWith(link.to + '/');
            return (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                className={active ? 'sidebar-link-active' : 'sidebar-link'}
                title={collapsed ? link.label : undefined}>
                <link.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{link.label}</span>}
                {link.label === 'Team Chat' && unreadChats > 0 && !collapsed && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">{unreadChats}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-bold text-sidebar-foreground flex-shrink-0">
                {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate flex items-center gap-2">
                  {profile.name}
                  <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Online" />
                </p>
                <p className="text-xs text-sidebar-muted capitalize">{isAdmin ? 'admin' : 'employee'}</p>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} className="text-sidebar-muted hover:text-destructive transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
          {!collapsed && (
            <div className="mt-4 pt-4 border-t border-sidebar-border/30 text-center">
              <p className="text-[8px] uppercase tracking-tighter text-sidebar-muted/30 font-medium">
                Designed and Developed by Mhd Wasim
              </p>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-background flex items-center px-4 gap-4 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground font-display hidden sm:block">
            {links.find(l => location.pathname.startsWith(l.to))?.label || 'Dashboard'}
          </h2>

          <div className="flex-1 max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              className="input-nawi pl-9 py-1.5 text-sm" placeholder="Search clients..." />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-elevated overflow-hidden z-50">
                {searchResults.map((c: any) => (
                  <Link key={c.id} to={`/${isAdmin ? 'admin' : 'employee'}/clients/${c.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors">
                    <PlaneTakeoff className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.display_id} • {c.service || 'N/A'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link to={`/${isAdmin ? 'admin' : 'employee'}/notifications`} className="relative p-2 hover:bg-muted rounded-lg transition-colors" title="Notifications">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
            )}
          </Link>
          <Link to={`/${isAdmin ? 'admin' : 'employee'}/calendar`} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Calendar">
            <Calendar className="w-5 h-5 text-muted-foreground" />
          </Link>
          <HeaderCalculator />
          <button onClick={openAIChatbot} className="p-2 hover:bg-muted rounded-lg transition-colors" title="AI Assistant" aria-label="AI Assistant">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="hidden md:flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-bold text-primary flex items-center gap-1 uppercase tracking-wider">
              <Clock className="w-2.5 h-2.5" /> Dubai Time: {dubaiTime}
            </span>
            {workDuration && (
              <span className="text-[10px] font-bold text-success flex items-center gap-1 uppercase tracking-wider">
                <Sparkles className="w-2.5 h-2.5" /> Work Duration: {workDuration}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-medium">{today}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <AIChatbot hideFloatingButton />
    </div>
  );
}
