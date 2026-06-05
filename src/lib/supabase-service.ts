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
export function isRecurringDate(label?: string): boolean {
  if (!label) return false;
  const n = label.toLowerCase();
  return n.includes('birth') || n === 'dob' || n.includes('anniversary') || n.includes('wedding');
}

export function getUpcomingAgeOrYears(dateString: string): number {
  if (!dateString) return 0;
  const birthDate = new Date(dateString);
  if (isNaN(birthDate.getTime())) return 0;
  const birthYear = birthDate.getFullYear();
  const today = new Date();
  let upcomingYear = today.getFullYear();
  const nextOccurrence = new Date(upcomingYear, birthDate.getMonth(), birthDate.getDate());
  if (nextOccurrence < today) {
    upcomingYear += 1;
  }
  return upcomingYear - birthYear;
}

export function daysUntil(dateString: string, label?: string): number {
  if (!dateString) return Infinity;
  const target = new Date(dateString);
  if (isNaN(target.getTime())) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (label && isRecurringDate(label)) {
    const next = new Date(today.getFullYear(), target.getMonth(), target.getDate());
    next.setHours(0, 0, 0, 0);
    if (next < today) {
      next.setFullYear(today.getFullYear() + 1);
    }
    return Math.ceil((next.getTime() - today.getTime()) / 86400000);
  }

  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function isExpiryOrDueDate(label?: string): boolean {
  if (!label) return true;
  const n = label.toLowerCase();
  if (
    n.includes('birth') || n === 'dob' ||
    n.includes('issue') ||
    n.includes('start') ||
    n.includes('departure') ||
    n.includes('return') ||
    n.includes('check-in') || n.includes('checkin') ||
    n.includes('check-out') || n.includes('checkout') ||
    n.includes('anniversary') || n.includes('wedding') ||
    n.includes('arrival') ||
    n.includes('time') ||
    n === 'travel date'
  ) {
    return false;
  }
  return true;
}

export function getDateStatus(dateString: string, label?: string): 'safe' | 'warning' | 'urgent' | 'overdue' {
  const days = daysUntil(dateString, label);
  if (label && !isExpiryOrDueDate(label)) {
    return 'safe';
  }
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

export function formatCurrency(amount: number, fractions = 2): string {
  return `AED ${amount.toLocaleString('en-AE', {
    minimumFractionDigits: fractions,
    maximumFractionDigits: fractions
  })}`;
}

export function getLocalTodayStr(): string {
  const d = new Date();
  // Adjust boundary: sessions before 4 AM belong to the previous calendar day
  // This supports night shifts ending after midnight.
  d.setHours(d.getHours() - 4);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// =================== ATTENDANCE ON LOGIN ===================
import { getAttendanceSettings, classifyLogin, isWeekend } from './settings';

/**
 * Handles the 'Morning Reset' and Daily Login logic.
 * Supports Night Shifts (crossing midnight) and uses a 7-hour grace window.
 */
export async function handleAttendanceHandshake(userId: string, lat?: number | null, lng?: number | null, locStatus?: string) {
  const today = getLocalTodayStr();
  const now = new Date();

  // 1. Check for any OPEN session (regardless of date)
  const { data: openSession } = await supabase
    .from('attendance')
    .select('id, date, login_time, employee_id, status, total_break_minutes, offline_minutes')
    .eq('employee_id', userId)
    .is('logout_time', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSession) {
    const settings = await getAttendanceSettings(userId);
    const [startH, startM] = (settings.work_start || '09:00').split(':').map(Number);
    const [endH, endM] = (settings.work_end || '18:00').split(':').map(Number);

    // Calculate when this specific shift was supposed to end
    const scheduledEnd = new Date(openSession.date);
    scheduledEnd.setHours(endH, endM, 0, 0);

    // If shift crosses midnight (e.g. 2 PM to 1 AM), the end is on the next calendar day
    if (endH < startH || (endH === startH && endM < startM)) {
      scheduledEnd.setDate(scheduledEnd.getDate() + 1);
    }

    // Rule: Wait 7 hours after scheduled end before auto-closing
    const GRACE_HOURS = 7;
    const cutoffTime = new Date(scheduledEnd.getTime() + GRACE_HOURS * 3600000);

    if (now < cutoffTime) {
      // User is still within their shift window or the 7-hour grace period
      // Do nothing, let them stay logged in to their current session
      return;
    }

    // EXCEEDED GRACE PERIOD: Auto-close the forgotten session
    const { data: profile } = await supabase.from('profiles').select('last_seen_at').eq('user_id', userId).single();
    const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at) : null;
    const loginDate = parseDbDate(openSession.login_time);

    // Smart logout time: Use heartbeat if it's sensible, otherwise cap at scheduled end
    let autoLogoutTime = lastSeen && loginDate && lastSeen > loginDate && lastSeen < cutoffTime ? lastSeen : scheduledEnd;

    const totalMs = autoLogoutTime.getTime() - (loginDate ? loginDate.getTime() : autoLogoutTime.getTime());
    const breakMs = (Number(openSession.total_break_minutes) || 0) * 60000;
    const offlineMs = (Number(openSession.offline_minutes) || 0) * 60000;
    const hoursWorked = Math.max(0, Math.round(((totalMs - breakMs - offlineMs) / 3600000) * 10) / 10);

    await supabase.from('attendance').update({
      logout_time: autoLogoutTime.toISOString(),
      hours_worked: hoursWorked,
      is_auto_logout: true,
      status: 'Without Checkout',
      work_summary: `AUTO-CLOSED (Forgotten session capped at ${autoLogoutTime.toLocaleTimeString()})`
    } as any).eq('id', openSession.id);

    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Session Auto-Closed',
      message: `Your session from ${openSession.date} was auto-closed as 'Without Checkout' after exceeding the 7-hour grace window.`,
      type: 'system',
      is_read: false
    });
  }

  // 2. Now handle starting a NEW session for TODAY (if didn't already return)
  const settings = await getAttendanceSettings(userId);
  if (isWeekend(now, settings)) return; 

  const { data: existingToday } = await supabase
    .from('attendance')
    .select('id, logout_time, offline_minutes, auto_logout_count, is_auto_logout')
    .eq('employee_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!existingToday) {
    // Only start a new session if they are within a reasonable start window for today
    // Or if it's their first login for this business day.
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
    // Re-login after manual logout on same day -> resume session
    const logoutDate = new Date(existingToday.logout_time);
    const offlineMin = Math.max(0, Math.round((now.getTime() - logoutDate.getTime()) / 60000));

    await supabase.from('attendance').update({
      logout_time: null,
      hours_worked: 0,
      is_auto_logout: false,
      offline_minutes: (Number(existingToday.offline_minutes) || 0) + offlineMin,
      auto_logout_count: (existingToday as any).is_auto_logout ? (Number((existingToday as any).auto_logout_count) || 0) + 1 : (Number((existingToday as any).auto_logout_count) || 0)
    } as any).eq('id', existingToday.id);
  }
}

export async function recordLoginAttendance(userId: string) {
  await handleAttendanceHandshake(userId);
}

// =================== NOTIFICATIONS ===================
export async function generateDailyNotifications(userId: string, isAdmin: boolean) {
  const today = getLocalTodayStr();

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
