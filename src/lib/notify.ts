// Centralized notification helpers — covers all CRM event types
import { supabase } from '@/integrations/supabase/client';

export type NotifyPayload = {
  user_id: string;
  title: string;
  message?: string;
  type?: string;
  client_id?: string | null;
};

export async function notify(p: NotifyPayload | NotifyPayload[]) {
  const arr = Array.isArray(p) ? p : [p];
  if (arr.length === 0) return;
  // DB has a unique index per (user, type, client, day) — duplicates are silently ignored.
  // We also dedupe in-memory before insert to avoid one-batch dupes.
  const seen = new Set<string>();
  const unique = arr.filter(n => {
    const k = `${n.user_id}|${n.type || 'general'}|${n.client_id || '-'}|${n.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { error } = await supabase.from('notifications').insert(
    unique.map(n => ({
      user_id: n.user_id,
      title: n.title,
      message: n.message || '',
      type: n.type || 'general',
      client_id: n.client_id ?? null,
    }))
  );
  // Ignore duplicate-key errors (23505) — they mean dedup worked.
  if (error && error.code !== '23505') console.warn('notify insert error:', error.message);
}

/** Notify all admins. */
export async function notifyAdmins(payload: Omit<NotifyPayload, 'user_id'>) {
  const { data } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
  const ids = (data || []).map((r: any) => r.user_id);
  if (ids.length === 0) return;
  await notify(ids.map(uid => ({ ...payload, user_id: uid })));
}

/** Notification type catalog — used by NotificationsPage filter & docs. */
export const NOTIFICATION_TYPES = [
  { key: 'passport_expiry', label: 'Passport Expiry', icon: '🛂' },
  { key: 'visa_expiry', label: 'Visa Expiry', icon: '📘' },
  { key: 'travel_date', label: 'Travel Date', icon: '✈️' },
  { key: 'birthday', label: 'Birthday', icon: '🎂' },
  { key: 'morning_summary', label: 'Morning Summary', icon: '☀️' },
  { key: 'lead_taken', label: 'Lead Taken', icon: '🎯' },
  { key: 'lead_converted', label: 'Lead Converted', icon: '🏆' },
  { key: 'lead_assigned', label: 'Lead Assigned', icon: '📨' },
  { key: 'client_created', label: 'New Client', icon: '👤' },
  { key: 'client_status', label: 'Client Status Change', icon: '🔄' },
  { key: 'task_assigned', label: 'Task Assigned', icon: '📌' },
  { key: 'task_overdue', label: 'Task Overdue', icon: '⏰' },
  { key: 'dsr_submitted', label: 'DSR Submitted', icon: '📋' },
  { key: 'dsr_missing', label: 'DSR Missing', icon: '📭' },
  { key: 'attendance_late', label: 'Late Login', icon: '⏱️' },
  { key: 'attendance_missing', label: 'Missed Attendance', icon: '🚫' },
  { key: 'leave_requested', label: 'Leave Requested', icon: '🏖️' },
  { key: 'leave_decision', label: 'Leave Approved/Rejected', icon: '✅' },
  { key: 'payroll_published', label: 'Payroll Published', icon: '💰' },
  { key: 'chat_mention', label: 'Chat Message', icon: '💬' },
  { key: 'goal_reached', label: 'Goal Reached', icon: '🎉' },
  { key: 'broadcast', label: 'Broadcast', icon: '📢' },
  { key: 'general', label: 'General', icon: '🔔' },
] as const;
