import { supabase } from '@/integrations/supabase/client';

export interface AttendanceSettings {
  work_start: string;             // "09:00"
  work_end: string;               // "18:00"
  grace_minutes: number;          // late threshold after work_start
  weekend_days: number[];         // 0=Sun..6=Sat (UAE default Fri/Sat = [5,6])
  half_day_after_hours: number;   // worked < this = Half Day (default 4)
  min_full_day_hours: number;     // worked >= this = Full Day (default 8)
  early_leave_threshold_min: number; // logout > N min before work_end = Early Leave
  auto_logout_outside_zone: boolean; // sign user out if they leave the zone mid-day
  enforce_geofence: boolean;      // master switch — if false, all zone checks skipped
  default_zone_id?: string | null; // zone applied when employee has no specific zone
  inactivity_logout_min: number;   // auto logout after X min of no activity (0 to disable)
  lunch_break_min: number;         // standard lunch deduction or break time allowance
}

export type EmployeeOverride = Partial<AttendanceSettings> & {
  enforce_geofence?: boolean;     // per-employee bypass (for field/sales staff)
};
export type AttendanceOverrides = Record<string, EmployeeOverride>;

export const DEFAULT_ATTENDANCE: AttendanceSettings = {
  work_start: '09:00',
  work_end: '18:00',
  grace_minutes: 15,
  weekend_days: [0],
  half_day_after_hours: 4,
  min_full_day_hours: 8,
  early_leave_threshold_min: 30,
  auto_logout_outside_zone: true,
  enforce_geofence: true,
  default_zone_id: null,
  inactivity_logout_min: 30,
  lunch_break_min: 60,
};

let baseCache: AttendanceSettings | null = null;
let overridesCache: AttendanceOverrides | null = null;
let cacheTime = 0;
const TTL = 60_000; // 1 minute

async function loadAll() {
  if (baseCache && overridesCache && Date.now() - cacheTime < TTL) return;
  const { data } = await supabase
    .from('app_settings' as any)
    .select('key, value')
    .in('key', ['attendance', 'attendance_overrides']);
  const rows = (data as any[]) || [];
  const baseRow = rows.find(r => r.key === 'attendance');
  const ovRow = rows.find(r => r.key === 'attendance_overrides');
  baseCache = { ...DEFAULT_ATTENDANCE, ...((baseRow?.value as any) || {}) };
  overridesCache = (ovRow?.value as AttendanceOverrides) || {};
  cacheTime = Date.now();
}

/** Force a reload on next read (e.g. after admin saves settings elsewhere). */
export function invalidateAttendanceCache() {
  baseCache = null;
  overridesCache = null;
  cacheTime = 0;
}

/** Returns global settings, or merged with per-employee override when userId given. */
export async function getAttendanceSettings(userId?: string): Promise<AttendanceSettings> {
  await loadAll();
  const base = baseCache!;
  if (!userId) return base;
  const ov = overridesCache?.[userId] || {};
  return { ...base, ...ov };
}

export async function getAttendanceOverrides(): Promise<AttendanceOverrides> {
  await loadAll();
  return overridesCache || {};
}

export async function saveAttendanceSettings(value: AttendanceSettings, userId?: string) {
  const { error } = await supabase
    .from('app_settings' as any)
    .upsert({ key: 'attendance', value, updated_by: userId, updated_at: new Date().toISOString() } as any, { onConflict: 'key' });
  if (!error) {
    baseCache = value;
    cacheTime = Date.now();
  }
  return { error };
}

/** Save the full overrides map (object keyed by user_id). Pass {} to clear all. */
export async function saveAttendanceOverrides(overrides: AttendanceOverrides, updatedBy?: string) {
  const { error } = await supabase
    .from('app_settings' as any)
    .upsert(
      { key: 'attendance_overrides', value: overrides as any, updated_by: updatedBy, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' }
    );
  if (!error) {
    overridesCache = overrides;
    cacheTime = Date.now();
  }
  return { error };
}

/** Returns login classification: Present | Late. */
export function classifyLogin(now: Date, settings: AttendanceSettings): 'Present' | 'Late' {
  const [h, m] = settings.work_start.split(':').map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(h, m + (settings.grace_minutes || 0), 0, 0);
  return now <= cutoff ? 'Present' : 'Late';
}

/** Returns full-day classification based on hours worked + logout time. */
export function classifyDay(
  loginAt: Date,
  logoutAt: Date,
  settings: AttendanceSettings
): { status: 'Present' | 'Late' | 'Half Day' | 'Early Leave' | 'Overtime'; hoursWorked: number; isEarly: boolean; isOvertime: boolean } {
  const hoursWorked = Math.max(0, (logoutAt.getTime() - loginAt.getTime()) / 3_600_000);
  const baseStatus = classifyLogin(loginAt, settings);

  // Early leave: logged out earlier than (work_end - threshold)
  const [eh, em] = settings.work_end.split(':').map(Number);
  const endCutoff = new Date(logoutAt);
  endCutoff.setHours(eh, em - (settings.early_leave_threshold_min || 0), 0, 0);
  const isEarly = logoutAt < endCutoff;

  // Overtime: stayed > 30 min beyond work_end
  const overtimeMark = new Date(logoutAt);
  overtimeMark.setHours(eh, em + 30, 0, 0);
  const isOvertime = logoutAt > overtimeMark;

  let status: 'Present' | 'Late' | 'Half Day' | 'Early Leave' | 'Overtime' = baseStatus;
  if (hoursWorked < (settings.half_day_after_hours || 4)) status = 'Half Day';
  else if (isEarly && hoursWorked < (settings.min_full_day_hours || 8)) status = 'Early Leave';
  else if (isOvertime) status = 'Overtime';

  return { status, hoursWorked: Math.round(hoursWorked * 10) / 10, isEarly, isOvertime };
}

export function isWeekend(date: Date, settings: AttendanceSettings): boolean {
  return settings.weekend_days.includes(date.getDay());
}
