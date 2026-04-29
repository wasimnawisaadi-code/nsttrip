# Nawi Saadi CRM — Full Deployment Guide (Vercel + Supabase)

> Step-by-step manual deployment outside Lovable. Covers exporting code, setting up your own Supabase project, environment variables, and deploying the frontend to Vercel.

---

## 1. What You Need Before Starting

| Item | Where to get it | Cost |
|------|----------------|------|
| GitHub account | https://github.com | Free |
| Vercel account | https://vercel.com (sign in with GitHub) | Free Hobby plan works |
| Supabase account | https://supabase.com | Free tier OK to start |
| This project's source code | Lovable → top right → **GitHub → Connect to GitHub** | — |
| Node.js 18+ (only if testing locally) | https://nodejs.org | Free |

---

## 2. Push Code to GitHub (from Lovable)

1. In Lovable, click the **GitHub** button (top right) → **Connect to GitHub**.
2. Authorize the Lovable GitHub app.
3. Click **Create Repository** → choose your GitHub user/org → repo name e.g. `nawi-saadi-crm`.
4. Lovable pushes all code automatically. Verify on github.com that files appear.

---

## 3. Create Your Own Supabase Project

> You currently use Lovable Cloud's managed Supabase. For your own deployment you need your own Supabase project so you control the data.

### 3.1 Create the project
1. Go to https://supabase.com → **New Project**.
2. Name: `nawi-saadi-crm`. Region: closest to UAE (e.g. `ap-south-1 Mumbai` or `eu-central-1`).
3. Set a strong **database password** (save it in a password manager).
4. Wait ~2 minutes for provisioning.

### 3.2 Get the keys (SETTINGS → API)
Copy these three values — you'll paste them into Vercel later:
- **Project URL** → e.g. `https://xxxxxxxx.supabase.co`
- **anon / public key** (safe for browser)
- **service_role key** (server only — NEVER expose in frontend)

Also from **Settings → General**: copy the **Project Reference ID** (the `xxxxxxxx` part).

### 3.3 Apply the database schema
You have two options:

**Option A — Use Supabase CLI (recommended):**
```bash
# On your machine, after cloning the repo from GitHub:
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```
This applies every migration in `supabase/migrations/` to your new project.

**Option B — Manual via SQL Editor:**
1. Open Supabase dashboard → **SQL Editor**.
2. Open each file in `supabase/migrations/` (oldest first by filename timestamp).
3. Paste contents → **Run**. Repeat for every file in order.

### 3.4 Create Storage buckets
Dashboard → **Storage** → **New bucket**. Create exactly these:

| Bucket name | Public? |
|-------------|---------|
| `documents` | No |
| `photos` | Yes |
| `chat-media` | Yes |
| `lead-proofs` | Yes |

Then run the storage policies (already inside the migrations — if you used Option A, skip this).

### 3.5 Auth settings
Dashboard → **Authentication → Providers**:
- **Email**: Enable. Turn OFF "Confirm email" for first admin login (turn back on later).
- **Google** (optional): add your Google OAuth client ID/secret.

Dashboard → **Authentication → URL Configuration**:
- **Site URL**: your Vercel URL (e.g. `https://nawi-saadi-crm.vercel.app`).
- **Redirect URLs**: add the same URL plus `http://localhost:5173` for local dev.

### 3.6 Deploy Edge Functions
```bash
supabase functions deploy admin-delete-employee --no-verify-jwt
supabase functions deploy ai-assistant --no-verify-jwt
supabase functions deploy extract-document --no-verify-jwt
supabase functions deploy send-date-reminders --no-verify-jwt
supabase functions deploy sync-social-leads --no-verify-jwt
```

### 3.7 Set edge-function secrets
You need **LOVABLE_API_KEY** for the AI features. Outside Lovable you must replace that with a real provider:

**Quick path — keep Lovable AI Gateway key:**
- Lovable AI Gateway is only available inside Lovable Cloud. Outside, swap to OpenAI/Gemini directly.

**Recommended — use OpenAI directly:**
1. Get an API key from https://platform.openai.com/api-keys.
2. In Supabase → **Project Settings → Edge Functions → Manage secrets**, add:
   - `OPENAI_API_KEY` = `sk-...`
3. Edit `supabase/functions/ai-assistant/index.ts` and `extract-document/index.ts` to call OpenAI's API instead of `https://ai.gateway.lovable.dev`. Example:
   ```ts
   const res = await fetch('https://api.openai.com/v1/chat/completions', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ model: 'gpt-4o-mini', messages: [...] }),
   });
   ```
4. Redeploy the functions.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — no need to set them.

### 3.8 Create the first superadmin
SQL Editor:
```sql
-- 1. Sign up via the app once (email + password) so an auth.users row exists.
-- 2. Then run:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'superadmin'::public.app_role
FROM auth.users
WHERE email = 'your-admin-email@example.com';
```

---

## 4. Deploy Frontend to Vercel

### 4.1 Import the GitHub repo
1. Go to https://vercel.com/new.
2. Pick your `nawi-saadi-crm` repo → **Import**.
3. **Framework preset**: Vite (auto-detected).
4. **Build command**: `npm run build` (default).
5. **Output directory**: `dist` (default).
6. **Install command**: `npm install` (default).

### 4.2 Environment variables (CRITICAL)
Click **Environment Variables** and add these three (use values from step 3.2):

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your **anon** key |
| `VITE_SUPABASE_PROJECT_ID` | `YOUR_REF` |

> ⚠️ Never put `service_role` key in Vercel frontend env vars.

### 4.3 Deploy
Click **Deploy**. Wait ~2 min. Vercel gives you a URL like `nawi-saadi-crm.vercel.app`.

### 4.4 Update Supabase Auth URLs
Go back to Supabase → **Authentication → URL Configuration** → set Site URL + Redirect URLs to your new Vercel domain.

---

## 5. Custom Domain (optional)

1. Vercel project → **Settings → Domains** → add `crm.yourdomain.com`.
2. Add the CNAME record Vercel shows you in your DNS provider.
3. Add the same custom domain to Supabase Auth URL configuration.

---

## 6. API Keys Summary

| Key | Where stored | Purpose |
|-----|--------------|---------|
| Supabase **anon key** | Vercel env `VITE_SUPABASE_PUBLISHABLE_KEY` + frontend code | Browser → DB (RLS-protected) |
| Supabase **service_role key** | Supabase Edge Function secrets only | Admin-delete-employee function |
| `OPENAI_API_KEY` (or other AI) | Supabase Edge Function secrets | AI chatbot, document OCR |
| Google OAuth Client ID/Secret | Supabase Auth → Providers → Google | Google sign-in |
| WhatsApp Business token (optional) | Edge Function secret `WHATSAPP_TOKEN` | Reminder sends — only if you wire it |

---

## 7. Cron Jobs (Important Date Reminders)

Supabase dashboard → **Database → Cron Jobs** (or Edge Function Schedules):
```sql
select cron.schedule(
  'daily-date-reminders',
  '0 8 * * *',  -- every day 08:00 UTC
  $$ select net.http_post(
       url := 'https://YOUR_REF.supabase.co/functions/v1/send-date-reminders',
       headers := '{"Content-Type":"application/json"}'::jsonb
     ); $$
);
```

---

## 8. Daily Operations After Deploy

| Action | Where |
|--------|-------|
| View users | Supabase → Authentication → Users |
| Inspect data | Supabase → Table Editor |
| Function logs | Supabase → Edge Functions → Logs |
| Frontend logs | Vercel → Project → Logs |
| Redeploy frontend | Push to GitHub `main` → Vercel auto-deploys |
| Update DB schema | Add new file to `supabase/migrations/` → `supabase db push` |

---

## 9. Backups

- Supabase → **Database → Backups**: free tier = daily auto-backup (7 days). Paid = point-in-time recovery.
- Manual export: Supabase → **Database → Backups → Download**.

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| White page after deploy | Check Vercel logs; usually wrong env var name (must start with `VITE_`). |
| "Invalid API key" in app | `VITE_SUPABASE_PUBLISHABLE_KEY` doesn't match the project URL. |
| Login redirects fail | Site URL / Redirect URL not added in Supabase Auth settings. |
| Edge function 500 | Function secret missing — set `OPENAI_API_KEY` etc. |
| AI chatbot returns nothing | You're outside Lovable Cloud → must swap `LOVABLE_API_KEY` to a real provider. |
| RLS denies everything | First user has no role row → run the superadmin INSERT in step 3.8. |

---

## 11. Going Back to Lovable

You can always re-edit in Lovable while running production on Vercel:
- Lovable pushes to your GitHub repo's `main` branch.
- Vercel auto-deploys every push.
- Database changes you make in Lovable Cloud will NOT reach your Vercel-connected Supabase project — keep schemas in sync manually via migration files.

---

*Generated for Nawi Saadi CRM. Keep this file private — it references infrastructure setup.*
