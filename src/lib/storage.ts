// localStorage service layer — no direct localStorage calls in components

export const storage = {
  get<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  },

  set(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  },

  getAll(key: string): any[] {
    return this.get(key) || [];
  },

  push(key: string, item: any): void {
    const arr = this.getAll(key);
    arr.push(item);
    this.set(key, arr);
  },

  update(key: string, id: string, changes: any): void {
    const arr = this.getAll(key);
    const idx = arr.findIndex((i: any) => i.id === id);
    if (idx !== -1) {
      arr[idx] = { ...arr[idx], ...changes };
      this.set(key, arr);
    }
  },

  delete(key: string, id: string): void {
    const arr = this.getAll(key);
    this.set(key, arr.filter((i: any) => i.id !== id));
  },

  search(key: string, query: string, fields: string[]): any[] {
    const arr = this.getAll(key);
    const q = query.toLowerCase();
    return arr.filter((item: any) =>
      fields.some((f) => String(item[f] || '').toLowerCase().includes(q))
    );
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },
};

// Keys
export const KEYS = {
  ADMIN: 'nawi_admin',
  EMPLOYEES: 'nawi_employees',
  CLIENTS: 'nawi_clients',
  TASKS: 'nawi_tasks',
  QUOTATIONS: 'nawi_quotations',
  GOALS: 'nawi_goals',
  ATTENDANCE: 'nawi_attendance',
  LEAVE: 'nawi_leave',
  PAYROLL: 'nawi_payroll',
  NOTIFICATIONS: 'nawi_notifications',
  AUDIT_LOG: 'nawi_audit_log',
  SESSION: 'nawi_session',
  CHAT: 'nawi_chat',
  CHAT_GROUPS: 'nawi_chat_groups',
};

// ID generators
export function generateId(prefix: string): string {
  const key = `nawi_counter_${prefix}`;
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  const padLen = prefix === 'EMP' || prefix === 'ADM' || prefix === 'GOAL' ? 3 : 5;
  return `${prefix}-${String(next).padStart(padLen, '0')}`;
}

// Session types
export interface Session {
  userId: string;
  userName: string;
  userPhoto?: string;
  role: 'admin' | 'employee';
  loginTime: string;
  token: string;
}

export function getCurrentUser(): Session | null {
  return storage.get<Session>(KEYS.SESSION);
}

export function isAdmin(): boolean {
  const s = getCurrentUser();
  return s?.role === 'admin';
}

export function logout(): void {
  const session = getCurrentUser();
  if (session) {
    const today = new Date().toISOString().split('T')[0];
    const attendance = storage.getAll(KEYS.ATTENDANCE);
    const todayRecord = attendance.find(
      (a: any) => a.employeeId === session.userId && a.date === today
    );
    if (todayRecord && !todayRecord.logoutTime) {
      const logoutTime = new Date().toISOString();
      const loginDate = new Date(todayRecord.loginTime);
      const logoutDate = new Date(logoutTime);
      const hoursWorked = Math.round(((logoutDate.getTime() - loginDate.getTime()) / 3600000) * 10) / 10;
      storage.update(KEYS.ATTENDANCE, todayRecord.id, { logoutTime, hoursWorked });
    }
  }
  storage.remove(KEYS.SESSION);
}

// Audit logging
export function auditLog(
  action: string,
  targetType: string,
  targetId: string,
  changes: Record<string, unknown> = {}
): void {
  const session = getCurrentUser();
  storage.push(KEYS.AUDIT_LOG, {
    id: generateId('AUD'),
    userId: session?.userId || 'system',
    userName: session?.userName || 'System',
    action,
    targetType,
    targetId,
    changes,
    timestamp: new Date().toISOString(),
  });
}

// Date utilities
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

// Notification generator
export function generateDailyNotifications(userId: string, role: string): void {
  const clients = storage.getAll(KEYS.CLIENTS);
  const filtered = role === 'admin' ? clients : clients.filter((c: any) => c.assignedTo === userId || c.createdBy === userId);
  const existing = storage.getAll(KEYS.NOTIFICATIONS);
  const today = new Date().toISOString().split('T')[0];

  filtered.forEach((client) => {
    const dates = client.importantDates || {};
    const checks = [
      { field: 'passportExpiry', type: 'passport_expiry', title: 'Passport Expiry', threshold: 90 },
      { field: 'visaExpiry', type: 'visa_expiry', title: 'Visa Expiry', threshold: 60 },
      { field: 'travelDate', type: 'travel_date', title: 'Travel Date', threshold: 7 },
      { field: 'dob', type: 'birthday', title: 'Birthday', threshold: 0 },
    ];

    checks.forEach(({ field, type, title, threshold }) => {
      const dateVal = dates[field];
      if (!dateVal) return;
      const days = daysUntil(dateVal);
      const isDuplicate = existing.some(
        (n: any) => n.clientId === client.id && n.type === type && n.createdAt?.startsWith(today)
      );
      if (isDuplicate) return;

      if (type === 'birthday') {
        const d = new Date(dateVal);
        const todayDate = new Date();
        if (d.getMonth() === todayDate.getMonth() && d.getDate() === todayDate.getDate()) {
          storage.push(KEYS.NOTIFICATIONS, {
            id: generateId('NTF'), userId, type, title: `🎂 ${title} Today`,
            message: `${client.name}'s birthday is today!`, clientId: client.id, isRead: false, createdAt: new Date().toISOString(),
          });
        }
      } else if (days >= 0 && days <= threshold) {
        storage.push(KEYS.NOTIFICATIONS, {
          id: generateId('NTF'), userId, type, title: `${title} Alert`,
          message: `${client.name}'s ${title.toLowerCase()} is ${days === 0 ? 'today' : `in ${days} days`} (${formatDate(dateVal)})`,
          clientId: client.id, isRead: false, createdAt: new Date().toISOString(),
        });
      }
    });
  });
}

// Initialize data on first load
export function initializeApp(): void {
  if (storage.get(KEYS.ADMIN)) return;

  storage.set(KEYS.ADMIN, {
    id: 'ADM-001',
    name: 'System Administrator',
    email: 'admin@nawisaadi.com',
    passwordHash: 'Admin@Nawi2025!',
    role: 'admin',
    createdAt: '2025-01-01T00:00:00Z',
  });

  const keys = [
    KEYS.EMPLOYEES, KEYS.CLIENTS, KEYS.TASKS, KEYS.QUOTATIONS,
    KEYS.GOALS, KEYS.ATTENDANCE, KEYS.LEAVE, KEYS.PAYROLL,
    KEYS.NOTIFICATIONS, KEYS.AUDIT_LOG, KEYS.CHAT, KEYS.CHAT_GROUPS,
  ];
  keys.forEach((k) => {
    if (!storage.get(k)) storage.set(k, []);
  });
}
