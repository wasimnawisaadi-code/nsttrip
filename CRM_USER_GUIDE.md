# Nawi Saadi CRM — Complete User Guide (A → Z)

> Everything you need to operate the CRM as an Admin or Employee. Replaces all previous CRM docs.

---

## Table of Contents
1. [Login & Logout](#1-login--logout)
2. [Profiles & Access Types](#2-profiles--access-types)
3. [Geofence & Attendance](#3-geofence--attendance)
4. [Leave Management](#4-leave-management)
5. [Clients Module](#5-clients-module)
6. [Important Dates & Reminders](#6-important-dates--reminders)
7. [Quotations & Financials](#7-quotations--financials)
8. [Social Leads](#8-social-leads)
9. [Daily Status Report (DSR)](#9-daily-status-report-dsr)
10. [Payroll](#10-payroll)
11. [Performance & Goals](#11-performance--goals)
12. [Team Chat & Notifications](#12-team-chat--notifications)
13. [Broadcast Module](#13-broadcast-module)
14. [Audit Log](#14-audit-log)
15. [Admin Settings](#15-admin-settings)

---

## 1. Login & Logout

### Login
1. Go to `/login`.
2. Enter your **email + password** (provided by the admin).
3. The system checks:
   - **Account status** — deactivated accounts are blocked.
   - **Geofence** (employees only, office profiles) — must be inside an assigned zone.
   - **IP allowlist** (if configured for your profile).
4. On success, you're routed to:
   - Admin/Superadmin → `/admin/dashboard`
   - Employee → `/employee/dashboard`

### Logout
- Click your avatar in the header → **Logout**.
- For **employees**, logout automatically:
  - Stamps logout time + GPS location on today's attendance row.
  - Calculates `hours_worked`.
- **Admins** skip attendance stamping.
- **Auto-logout** triggers if an office employee leaves the geofence zone (3-second warning toast).

---

## 2. Profiles & Access Types

Two profile types control how attendance is enforced:

| Type | Login Rule | Use Case |
|------|-----------|----------|
| **office** | Must be inside assigned geofence zone (GPS verified). | Office staff |
| **sales** | No location restriction; selfie photo recommended on login. | Field sales reps |

Admin sets profile type when creating the employee.

---

## 3. Geofence & Attendance

### Admin: Setting Up Zones
1. Go to **Admin → Geofence**.
2. Click **Add Zone**, drop a pin on the map, set radius (default 100m).
3. Assign employees to zones via their profile.
4. Per-employee overrides available: Work Start/End time, Grace minutes, Weekend days.

### Employee: Daily Check-in
1. Open **Attendance** page → click **Check In**.
2. Browser requests GPS — must be inside zone for office profiles.
3. Status badges:
   - **Present** — on time
   - **Late** — past grace period
   - **Outside Zone** — flagged for admin review
4. **Check Out** before leaving — fills `logout_time`, `hours_worked`, GPS coords.
5. **Daily Work Summary** prompt appears at checkout (mandatory).

### UAE Labour Standards Applied
- 22 working days/month default
- Friday & Saturday weekend (configurable per employee)

---

## 4. Leave Management

### Employee
1. **Leave** page → **Request Leave**.
2. Pick: leave type (Annual/Sick/Unpaid/Emergency), start date, end date, reason.
3. Upload supporting document (e.g., medical certificate) — optional.
4. Status flow: `Pending → Approved/Rejected`.

### Admin
1. **Leave** page shows all requests with filter chips.
2. Click → **Approve** or **Reject** with optional note.
3. Approved leave automatically:
   - Decrements `leave_balance`
   - Reflects in next month's payroll deductions

### Sick Leave Tiers (UAE)
- First 15 days: full pay
- Next 30 days: half pay
- After: unpaid

---

## 5. Clients Module

### Add Client (Wizard — 5 steps)
1. **Search** — mandatory check for duplicates by mobile/passport.
2. **Personal Info** — name, mobile, email, nationality, lead source (with **Others** option for custom sources).
3. **Service Selection** — main service + subcategory (each with **Others** for custom values).
4. **Documents** — upload (auto-OCR via `extract-document` edge function for IDs/passports). Each doc dropdown supports **Others**.
5. **Family Members & Important Dates** — optional.

### Client List
- Filter by status (`New`/`Processing`/`Success`/`Failed`), service, assigned employee.
- Excel export available.
- Click any client → **Client Profile**.

### Client Profile
- Tabs: Overview, Services, Documents, Quotations, Family, Important Dates, Notes.
- Admins can **reassign** to another employee.
- Status changes trigger `audit_log` entries.

---

## 6. Important Dates & Reminders

- Centralized view of all client dates (visa expiry, passport expiry, birthdays, contract end, etc.).
- **Urgency colors**: red (≤7 days), amber (≤30 days), green (>30 days).
- Birthdays recur yearly automatically.
- Toggle **"Message sent / Unsent"** per row to silence WhatsApp follow-ups.
- Cron job `send-date-reminders` triggers WA messages via `wa.me` deep links.

---

## 7. Quotations & Financials

### Create Quote (inside Client Profile)
1. **Quotations** tab → **New Quote**.
2. Add line items (description, qty, unit price, cost).
3. System computes payable amount + profit.
4. **Generate PDF** (jsPDF) — branded with company header.
5. **Send via WhatsApp** — opens `wa.me/{client_mobile}` with pre-filled message + PDF link.

### Reports
- **Admin → Reports** — service-wise revenue, profit, employee performance.
- **Daily Status Report** includes Sales/Profit area chart + Top Performers bar chart.

---

## 8. Social Leads

- Auto-imported via `sync-social-leads` from WhatsApp / Instagram / Messenger.
- Statuses: **NEW → PROCESSING → SUCCESS → FAILED**.
- Employee can **claim** an unassigned lead.
- On conversion: upload **proof** (screenshot/PDF) → status moves to SUCCESS.
- Excel export + filter by source/status/date.
- Notes thread per lead for collaboration.

---

## 9. Daily Status Report (DSR)

### Admin
1. **DSR Templates** → create a template with custom columns (text/number/date/select).
2. **DSR Assignments** → assign templates to employees.

### Employee
1. **DSR** page → pick assigned template → fill today's row.
2. Sale/Cost/Profit auto-calculated from configured columns.
3. View own historical entries.

### Admin Dashboard
- Daily Trend area chart (Sales vs Profit)
- Top Performers bar chart (last 30 days by profit)

---

## 10. Payroll

- **Auto-generated monthly** from attendance + leave data.
- Editable fields: Base salary, Bonus, Allowances, Overtime, Deductions.
- Inline `payroll_entries` for itemized adjustments.
- **Lock** the month → freezes editing (only superadmin can unlock).
- Deduction thresholds follow UAE Labor Law:
  - Late: graduated by minutes
  - Absent: 1 day's pay per absent day
  - Unpaid leave: pro-rata
  - Sick beyond 15 days: 50% deduction

---

## 11. Performance & Goals

- **Admin → Goals** — set monthly targets per service per employee.
- **Performance Leaderboard** — ranks employees by goals achieved, sales, profit.
- Visual progress bars + medals for top 3.

---

## 12. Team Chat & Notifications

### Chat
- **General** group (auto-created, deduplicated) for company-wide announcements.
- Custom groups — any user can create; only creator/admin can delete.
- Direct messages between any two users.
- Attachments: images, audio voice notes, PDFs, files (stored in `chat-media`).
- **Unsend message** — hover → trash icon (own messages only).
- Realtime delivery + read receipts.

### Notifications
- Bell icon shows unread count.
- Auto-generated for: leave decisions, new lead assignments, important date alerts, payroll lock, mentions in chat.
- Mark all as read or delete individually.

---

## 13. Broadcast Module (Admin)

- Send mass WhatsApp messages to filtered client groups.
- Filter by service, status, nationality, assigned employee.
- Preview recipient count before sending.
- Uses `wa.me` deep links — opens WhatsApp Web/Desktop with pre-filled message.

---

## 14. Audit Log (Admin)

- Append-only history of every important action (create/update/delete).
- Filters: timeframe (Day/Week/Month/All), user, target type.
- Entry counter shows total visible records.
- Cannot be edited or deleted — legal-grade record.

---

## 15. Admin Settings

- **Settings page** controls:
  - Geofence enforcement on/off
  - Auto-logout outside zone on/off
  - Late grace period (minutes)
  - Working days per month
  - Weekend day picker
- **Employees page** — full CRUD + admin profile shown as read-only badge (so you can see clients created by admins).
- Admins/Superadmins **cannot** be deleted or deactivated.

---

## Quick Reference — Who Can Do What

| Action | Employee | Admin | Superadmin |
|--------|:-------:|:-----:|:----------:|
| View own clients | ✅ | ✅ | ✅ |
| View all clients | ❌ | ✅ | ✅ |
| Create employee | ❌ | ✅ | ✅ |
| Delete employee | ❌ | ✅ | ✅ |
| Lock/unlock payroll | ❌ | Lock only | Lock + Unlock |
| Edit audit log | ❌ | ❌ | ❌ |
| Manage geofence | ❌ | ✅ | ✅ |
| Send broadcasts | ❌ | ✅ | ✅ |
| Approve leave | ❌ | ✅ | ✅ |

---
*Last updated with Batch 6 production upgrade.*
