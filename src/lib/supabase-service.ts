// Supabase service layer — replaces localStorage storage.ts
import { supabase } from '@/integrations/supabase/client';

// =================== DISPLAY ID GENERATOR ===================
export async function generateDisplayId(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_display_id', { prefix });
  if (error) {
    console.error('generate_display_id error:', error);
    // Fallback: generate client-side
    return `${prefix}-${Date.now().toString().slice(-5)}`;
  }
  return data as string;
}

// =================== AUDIT LOG ===================
export async function auditLog(
  action: string, targetType: string, targetId: string,
  changes: Record<string, unknown> = {}
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('user_id', user.id)
    .single();

  await supabase.from('audit_log').insert([{
    user_id: user.id,
    user_name: profile?.name || 'Unknown',
    action, target_type: targetType, target_id: targetId, changes: changes as any,
  }]);
}

// =================== DATE UTILITIES ===================
export function daysUntil(dateString: string): number {
  if (!dateString) return Infinity;
  const target = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function getDateStatus(dateString: string): 'safe' | 'warning' | 'urgent' | 'overdue' {
  const days = daysUntil(dateString);
  if (days < 0) return 'overdue';
  if (days < 30) return 'urgent';
  if (days < 90) return 'warning';
  return 'safe';
}

export function safeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseDbDate(dateStr);
    if (!d) return '—';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '—';
  }
}

export function parseDbDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parseStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(parseStr);
  return isNaN(d.getTime()) ? null : d;
}

export function calculateWorkingDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const current = new Date(s);
  while (current <= e) {
    const day = current.getDay();
    if (day !== 5 && day !== 6) count++; // UAE weekend: Fri/Sat
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function formatCurrency(amount: number): string {
  return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// =================== ATTENDANCE ON LOGIN ===================
import { getAttendanceSettings, classifyLogin, isWeekend } from './settings';

/**
 * Handles the 'Morning Reset' and Daily Login logic.
 * 1. Checks if there is an open session from a PREVIOUS day.
 * 2. If found, auto-closes it using the user's last_seen_at (heartbeat).
 * 3. Ensures a new session is started for TODAY.
 */
export async function handleAttendanceHandshake(userId: string, lat?: number | null, lng?: number | null, locStatus?: string) {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  // 1. Check for forgotten sessions from YESTERDAY or before
  const { data: forgotten } = await supabase
    .from('attendance')
    .select('id, date, login_time, employee_id')
    .eq('employee_id', userId)
    .lt('date', today)
    .is('logout_time', null)
    .maybeSingle();

  if (forgotten) {
    // Get the user's last seen time (heartbeat) to use as the auto-checkout time
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_seen_at')
      .eq('user_id', userId)
      .single();

    const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at) : null;

    // Fallback: If no last seen or last seen is before login, use settings.work_end or 7 PM
    const settings = await getAttendanceSettings(userId);
    const [h, m] = (settings.work_end || '19:00').split(':').map(Number);
    
    let autoLogoutTime = lastSeen;
    const forgottenLoginDate = parseDbDate(forgotten.login_time);
    
    if (!autoLogoutTime || (forgottenLoginDate && autoLogoutTime <= forgottenLoginDate)) {
      if (forgottenLoginDate) {
        autoLogoutTime = new Date(forgottenLoginDate.setHours(h, m, 0, 0));
      } else {
        autoLogoutTime = new Date(); // Fallback if parsing fails completely
      }
    }

    const totalMs = autoLogoutTime.getTime() - (forgottenLoginDate ? forgottenLoginDate.getTime() : autoLogoutTime.getTime());
    const breakMs = (Number((forgotten as any).total_break_minutes) || 0) * 60000;
    const offlineMs = (Number((forgotten as any).offline_minutes) || 0) * 60000;
    const hoursWorked = Math.max(0, Math.round(((totalMs - breakMs - offlineMs) / 3600000) * 10) / 10);

    await supabase.from('attendance').update({
      logout_time: autoLogoutTime.toISOString(),
      hours_worked: hoursWorked,
      is_auto_logout: true,
      status: 'Without Checkout',
      work_summary: 'WITHOUT CHECKOUT'
    } as any).eq('id', forgotten.id);

    // Send Notification about the reset
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Session Auto-Closed',
      message: `Your session from ${forgotten.date} was auto-closed as 'Without Checkout' at ${autoLogoutTime.toLocaleTimeString()}.`,
      type: 'system',
      is_read: false
    });
  }

  // 2. Now handle TODAY'S login
  const settings = await getAttendanceSettings(userId);
  if (isWeekend(now, settings)) return; // Don't track weekends

  const { data: existingToday } = await supabase
    .from('attendance')
    .select('id, logout_time')
    .eq('employee_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!existingToday) {
    const status = classifyLogin(now, settings);
    await supabase.from('attendance').insert({
      employee_id: userId,
      date: today,
      login_time: now.toISOString(),
      status,
      login_lat: lat,
      login_lng: lng,
      login_location_status: locStatus || 'no_zone',
    } as any);
  } else if (existingToday.logout_time) {
    // Re-login after logout on same day -> resume session
    const logoutDate = new Date(existingToday.logout_time);
    const offlineMin = Math.max(0, Math.round((now.getTime() - logoutDate.getTime()) / 60000));
    
    const currentOffline = Number((existingToday as any).offline_minutes) || 0;
    const currentAutoCount = Number((existingToday as any).auto_logout_count) || 0;
    const isAuto = (existingToday as any).is_auto_logout === true;

    await supabase.from('attendance').update({
      logout_time: null,
      hours_worked: 0,
      is_auto_logout: false,
      offline_minutes: currentOffline + offlineMin,
      auto_logout_count: isAuto ? currentAutoCount + 1 : currentAutoCount
    } as any).eq('id', existingToday.id);
  }
}

export async function recordLoginAttendance(userId: string) {
  await handleAttendanceHandshake(userId);
}

// =================== NOTIFICATIONS ===================
export async function generateDailyNotifications(userId: string, isAdmin: boolean) {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase.from('clients').select('id, name, important_dates, mobile');
  if (!isAdmin) {
    query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
  }
  const { data: clients } = await query;
  if (!clients) return;

  const { data: existing } = await supabase
    .from('notifications')
    .select('client_id, type')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`);

  const existingSet = new Set((existing || []).map(n => `${n.client_id}-${n.type}`));

  const checks = [
    { field: 'passportExpiry', type: 'passport_expiry', title: 'Passport Expiry', threshold: 90 },
    { field: 'visaExpiry', type: 'visa_expiry', title: 'Visa Expiry', threshold: 60 },
    { field: 'travelDate', type: 'travel_date', title: 'Travel Date', threshold: 7 },
    { field: 'dob', type: 'birthday', title: 'Birthday', threshold: 0 },
  ];

  const inserts: any[] = [];
  for (const client of clients) {
    const dates = (client.important_dates as Record<string, string>) || {};
    for (const { field, type, title, threshold } of checks) {
      const dateVal = dates[field];
      if (!dateVal) continue;
      if (existingSet.has(`${client.id}-${type}`)) continue;

      const days = daysUntil(dateVal);
      if (type === 'birthday') {
        const d = new Date(dateVal);
        const todayDate = new Date();
        if (d.getMonth() === todayDate.getMonth() && d.getDate() === todayDate.getDate()) {
          inserts.push({
            user_id: userId, type, title: `🎂 ${title} Today`,
            message: `${client.name}'s birthday is today!`, client_id: client.id,
          });
        }
      } else if (days >= 0 && days <= threshold) {
        inserts.push({
          user_id: userId, type, title: `${title} Alert`,
          message: `${client.name}'s ${title.toLowerCase()} is ${days === 0 ? 'today' : `in ${days} days`} (${formatDate(dateVal)})`,
          client_id: client.id,
        });
      }
    }
  }

  if (inserts.length > 0) {
    // In-memory dedup as well (same client+type only once)
    const seen = new Set<string>();
    const unique = inserts.filter(n => {
      const k = `${n.user_id}|${n.type}|${n.client_id || '-'}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const { error } = await supabase.from('notifications').insert(unique);
    if (error && (error as any).code !== '23505') console.warn('daily notif insert:', error.message);
  }

  // Admin morning summary — runs once per day for admins
  if (isAdmin) {
    const summaryKey = `morning_summary`;
    if (!existingSet.has(`null-${summaryKey}`)) {
      const { data: existingSummary } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', summaryKey)
        .gte('created_at', `${today}T00:00:00`)
        .maybeSingle();

      if (!existingSummary) {
        const [tasksRes, leaveRes, attRes] = await Promise.all([
          supabase.from('tasks').select('id, status, due_date'),
          supabase.from('leave_requests').select('id').eq('status', 'Pending'),
          supabase.from('attendance').select('id, status').eq('date', today),
        ]);
        const tasks = tasksRes.data || [];
        const overdue = tasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.due_date && new Date(t.due_date) < new Date()).length;
        const pendingLeave = (leaveRes.data || []).length;
        const presentToday = (attRes.data || []).filter((a: any) => a.status === 'Present' || a.status === 'Late').length;
        const newClientsToday = clients.length;

        await supabase.from('notifications').insert([{
          user_id: userId,
          type: summaryKey,
          title: '☀️ Morning Summary',
          message: `${presentToday} present today · ${pendingLeave} pending leave · ${overdue} overdue tasks · ${newClientsToday} active clients in your scope`,
        }]);
      }
    }
  }
}
