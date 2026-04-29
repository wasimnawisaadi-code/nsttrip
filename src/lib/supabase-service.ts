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
import { getAttendanceSettings, classifyLogin } from './settings';

export async function recordLoginAttendance(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('employee_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!existing) {
    const now = new Date();
    const settings = await getAttendanceSettings(userId);
    const status = classifyLogin(now, settings);
    await supabase.from('attendance').insert({
      employee_id: userId,
      date: today,
      login_time: now.toISOString(),
      status,
    });
  }
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
