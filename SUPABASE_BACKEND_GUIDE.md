# Nawi Saadi CRM — Supabase Backend Guide

> Single source of truth for the database, storage, edge functions, security model, and operational workflow. Replaces all previous backend docs.

---

## 1. Project Overview

The CRM uses **Lovable Cloud (Supabase)** for:
- PostgreSQL database with Row-Level Security (RLS)
- Authentication (email + password)
- File storage (documents, photos, chat media, lead proofs)
- Edge Functions (server-side logic & cron jobs)
- Realtime subscriptions (chat, notifications)

**Project ref:** `pbmiutkqxigcdqiifjjf`

---

## 2. Roles & Access Model

Roles are stored in the `user_roles` table (NEVER on `profiles`) using the enum `app_role`:

| Role | Capabilities |
|------|-------------|
| `superadmin` | Full system access. Cannot be deleted/deactivated. |
| `admin` | Full access to all clients, employees, payroll, settings. |
| `employee` | Sees only clients they **created** or are **assigned to**. |

Helper SQL functions:
- `has_role(user_id, role)` — RLS gate used everywhere.
- `is_superadmin(user_id)` — payroll + critical-action gate.

---

## 3. Tables (Domain-Grouped)

### 3.1 Identity & Access
- **`profiles`** — name, email, mobile, photo_url, profile_type (`office`/`sales`), allowed_ips, base_salary, leave_balance, assigned_zone_id, status (`active`/`inactive`).
- **`user_roles`** — (user_id, role) one row per role assignment.
- **`app_settings`** — per-employee or global settings (key/value JSON).

### 3.2 Clients & Services
- **`clients`** — primary client record (name, mobile, email, nationality, lead_source, service, service_subcategory, status, assigned_to, created_by, revenue, profit, important_dates, family_members, documents).
- **`client_services`** — additional services per client (one client → many services).
- **`quotations`** — quotes generated from client profile (line_items JSON, quoted_price, payable_amount, profit, status).

### 3.3 HR & Operations
- **`attendance`** — daily login/logout, hours_worked, location, status.
- **`leave_requests`** — leave_type, start/end_date, days, document, status (`Pending`/`Approved`/`Rejected`).
- **`payroll`** — monthly payroll per employee (deductions, bonus, allowances, final_salary, locked).
- **`payroll_entries`** — line items (bonus/deduction/allowance) appended to a payroll row.
- **`geofence_zones`** — circular zones (lat/lng/radius) for office check-ins.
- **`tasks`** — internal task assignments tied to clients.
- **`goals`** — monthly targets per service/employee.

### 3.4 Reporting
- **`dsr_templates`** — Daily Status Report templates (columns JSON).
- **`dsr_assignments`** — which employee gets which DSR template.
- **`dsr_entries`** — daily entries (sale_amount, cost_amount, profit_amount, data JSON).

### 3.5 Communication
- **`chat_groups`** — group chats (name, members[], created_by).
- **`chat_messages`** — text + attachment messages (group or direct).
- **`notifications`** — in-app notifications per user.
- **`social_leads`** — leads imported from WhatsApp/Instagram/Messenger (status: NEW/PROCESSING/SUCCESS/FAILED).
- **`lead_notes`** — comments on social leads.
- **`date_reminder_prefs`** — per-client date silencing for important-date reminders.

### 3.6 Audit
- **`audit_log`** — append-only log of every important action (create, update, delete) — admin-only readable.

---

## 4. Row-Level Security Patterns

Every table has RLS **enabled**. Common patterns:

**Admin global access:**
```sql
USING (has_role(auth.uid(), 'admin'::app_role))
```

**Employee scoped to ownership:**
```sql
USING (assigned_to = auth.uid() OR created_by = auth.uid())
```

**Insert-only-self:**
```sql
WITH CHECK (created_by = auth.uid())
```

**Audit log** is INSERT + SELECT only (no UPDATE/DELETE) to preserve integrity.

---

## 5. Storage Buckets

| Bucket | Public? | Purpose |
|--------|---------|---------|
| `documents` | No | Client passports, visas, contracts |
| `photos` | Yes | Employee profile photos |
| `chat-media` | Yes | Chat attachments (images, audio, files) |
| `lead-proofs` | Yes | Conversion proof for social leads |

Path convention: `{user_id}/{filename}` so RLS can match `auth.uid()::text = (storage.foldername(name))[1]`.

---

## 6. Edge Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `admin-delete-employee` | Hard-deletes an employee + auth user (service-role). | Admin UI button |
| `ai-assistant` | AI chatbot using Lovable AI Gateway. | Chat widget |
| `extract-document` | OCR for uploaded ID/passport docs (Gemini Vision). | Add Client wizard |
| `send-date-reminders` | Sends WhatsApp follow-ups for upcoming expiries/birthdays. | Daily cron (recommended) |
| `sync-social-leads` | Pulls new leads from WhatsApp/IG/Messenger webhooks. | Cron / webhook |

All functions use `LOVABLE_API_KEY` (already provisioned) for AI calls. No external API keys required by default.

---

## 7. Database Functions & Triggers

- **`handle_new_user()`** — auto-creates a `profiles` row when a new auth user signs up.
- **`generate_display_id(prefix)`** — returns padded IDs like `EMP-001`, `CLT-00001`, `GOAL-001`.
- **`update_updated_at_column()`** — generic trigger for timestamp maintenance.

---

## 8. Secrets (already configured)

`LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEY`.

---

## 9. Migration Workflow

1. Schema changes → use the migration tool (creates a SQL file under `supabase/migrations/`).
2. Data updates → use the insert tool (INSERT/UPDATE/DELETE).
3. **Never edit** `src/integrations/supabase/client.ts` or `types.ts` — auto-regenerated.
4. After each migration: verify RLS is enabled and policies cover all four operations (SELECT/INSERT/UPDATE/DELETE) where appropriate.

---

## 10. Realtime

Enabled on `chat_messages`, `chat_groups`, `notifications`. Subscribe via:
```ts
supabase.channel('messages')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, handler)
  .subscribe();
```

---

## 11. Backup & Safety Rules

- **Audit log** — never truncate; it's the legal record.
- **Payroll** — once `locked = true`, no edits allowed even by admins (enforced in UI).
- **Soft delete** preferred for clients/employees; only superadmin can hard-delete.
- **Geofence zones** — keep at least one active zone per office to prevent lockout.

---

## 12. Common Operational Tasks

| Task | Where | Notes |
|------|-------|-------|
| Add employee | Admin → Employees → Add Employee | Auto-creates auth user + profile + role. |
| Lock payroll month | Admin → Payroll → Lock | Irreversible without superadmin override. |
| Reassign client | Admin → Client Profile → Assign To | Updates `clients.assigned_to`. |
| Silence a reminder | Important Dates → toggle "Message sent" | Writes to `date_reminder_prefs`. |
| Mark lead converted | Social Leads → Mark Converted | Uploads proof to `lead-proofs` bucket. |

---
*Last updated with Batch 6 production upgrade.*
