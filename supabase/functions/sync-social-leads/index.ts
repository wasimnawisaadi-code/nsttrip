// Sync leads from Google Sheets via Service Account (GOOGLE_SHEETS_SA_JSON)
// Sheets must be shared (Viewer) with the service account email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHEETS = {
  whatsapp:  { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "0" },
  instagram: { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "2060179211" },
  messenger: { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "1104863519" },
} as const;

function csvUrl(id: string, gid: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ============ Service Account → OAuth Access Token ============
let cachedToken: { token: string; exp: number } | null = null;

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = new TextEncoder().encode(data);
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = data;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getSheetsAccessToken(): Promise<string | null> {
  const saJson = Deno.env.get('GOOGLE_SHEETS_SA_JSON');
  if (!saJson) return null;
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  try {
    const sa = JSON.parse(saJson);
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, iat: now,
    }))}`;
    const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${b64url(sig)}`;
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
      }),
    });
    if (!tokRes.ok) { console.error('Sheets token exchange failed', await tokRes.text()); return null; }
    const tok = await tokRes.json();
    cachedToken = { token: tok.access_token, exp: Date.now() + (tok.expires_in * 1000) };
    return tok.access_token;
  } catch (e) {
    console.error('Error getting sheets token', e);
    return null;
  }
}

const SHEET_TAB_CACHE: Record<string, string> = {};

async function getTabName(spreadsheetId: string, gid: string, token: string): Promise<string | null> {
  const cacheKey = `${spreadsheetId}:${gid}`;
  if (SHEET_TAB_CACHE[cacheKey]) return SHEET_TAB_CACHE[cacheKey];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error('getTabName failed', res.status, await res.text()); return null; }
  const json = await res.json();
  const sheet = json.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid));
  const title = sheet?.properties?.title || null;
  if (title) SHEET_TAB_CACHE[cacheKey] = title;
  return title;
}

async function fetchViaSheetsApi(spreadsheetId: string, gid: string, token: string): Promise<string[][] | null> {
  const tab = await getTabName(spreadsheetId, gid, token);
  if (!tab) return null;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("Sheets API error", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return (json.values as string[][]) || [];
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(cur); cur = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; i++; continue;
    }
    cur += c; i++;
  }
  if (cur || row.length) { row.push(cur); if (row.some(v => v.trim() !== "")) rows.push(row); }
  return rows;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toBool(s: string): boolean {
  return /^(true|yes|1)$/i.test(String(s).trim());
}

async function fetchAndParse(spreadsheetId: string, gid: string, token: string | null): Promise<Record<string, string>[]> {
  let rows: string[][] = [];
  if (token) {
    const apiRows = await fetchViaSheetsApi(spreadsheetId, gid, token);
    if (apiRows) rows = apiRows;
  }
  
  if (rows.length < 2) {
    const res = await fetch(csvUrl(spreadsheetId, gid), { redirect: "follow" });
    if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);
    const text = await res.text();
    rows = parseCSV(text);
  }

  if (rows.length < 2) return [];

  // SMART HEADER MAPPING: Handle duplicate headers
  const headers = rows[0].map((h, i) => {
    const val = (h || "").trim() || `column_${i}`;
    const count = rows[0].slice(0, i).filter(prev => (prev || "").trim() === (h || "").trim()).length;
    return count > 0 ? `${val}_${count}` : val;
  });

  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  });
}

function pick(obj: Record<string, string>, ...keys: string[]): string {
  const lcs = Object.keys(obj).reduce((acc, k) => {
    acc[k.toLowerCase()] = obj[k];
    return acc;
  }, {} as Record<string, string>);

  for (const k of keys) {
    const v = lcs[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function buildLead(source: "whatsapp" | "instagram" | "messenger", row: Record<string, string>) {
  const keys = Object.keys(row);
  const first = pick(row, "First Name", "first_name", "Firstname");
  const last = pick(row, "Last Name", "last_name", "Lastname");
  const full = pick(row, "Full Name", "Name", "Full name") || `${first} ${last}`.trim();

  let unique_key = "";
  let phone = "";
  let username = "";
  let pageId = pick(row, "Page ID", "page_id", "Page Id");

  if (source === "whatsapp") {
    phone = pick(row, "Phone", "WhatsApp ID", "whatsapp_id", "WA ID", "Phone Number");
    unique_key = pick(row, "Contact ID", "Contact Id", "Contact id", "WhatsApp ID", "Phone", "unique_id") || phone;
  } else if (source === "instagram") {
    username = pick(row, "Username", "username", "Instagram Username", "IG Username", "Handle", "User Name", "Handle Name");
    if (!username) username = row[keys[12]] || ""; // Col 13
    const igId = pick(row, "Contact ID", "Contact Id", "Contact id", "Instagram ID", "User ID", "PSID", "ID");
    unique_key = igId || username || full || `${first}-${last}`.trim();
  } else {
    const msgrId = pick(row, "Contact ID", "Contact Id", "Contact id", "Messenger ID", "PSID", "User ID", "ID");
    unique_key = msgrId || pageId || full || `${first}-${last}`.trim();
  }

  if (!unique_key || unique_key === "null") return null;

  return {
    source, unique_key, first_name: first || null, last_name: last || null,
    full_name: full || "Unnamed", phone: phone || null, username: username || null,
    page_id: pageId || null, language: pick(row, "Language", "Locale") || null,
    gender: pick(row, "Gender", "gender") || null, timezone: pick(row, "Timezone", "timezone") || null,
    subscribed: row["Subscribed"] !== undefined ? toBool(row["Subscribed"]) : true,
    opted_in: (row["Opted-In"] !== undefined || row["Opted-in"] !== undefined) ? toBool(row["Opted-In"] || row["Opted-in"]) : true,
    last_interaction: parseDate(pick(row, "Last Interaction", "Last interaction")),
    last_seen: parseDate(pick(row, "Last Seen", "Last seen")),
    messaging_window: pick(row, "Messaging Window", "Messaging window segment") || null,
    raw: row,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary = { whatsapp: { new: 0, updated: 0, total: 0 }, instagram: { new: 0, updated: 0, total: 0 }, messenger: { new: 0, updated: 0, total: 0 } };

  try {
    const sheetsToken = await getSheetsAccessToken();
    for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      try {
        const { id, gid } = SHEETS[source];
        const rows = await fetchAndParse(id, gid, sheetsToken);
        summary[source].total = rows.length;

        for (const row of rows) {
          const lead = buildLead(source, row);
          if (!lead) continue;

          const { data: existing } = await supabase.from("social_leads").select("id").eq("source", source).eq("unique_key", lead.unique_key).maybeSingle();

          if (existing) {
            await supabase.from("social_leads").update({ ...lead }).eq("id", existing.id);
            summary[source].updated++;
          } else {
            const { data: idData } = await supabase.rpc("generate_display_id", { prefix: "LEAD" });
            const { data: inserted, error: insErr } = await supabase.from("social_leads").insert({ ...lead, display_id: (idData as string) || `LEAD-${Date.now()}`, status: "NEW" }).select("id, full_name, source").single();
            
            if (!insErr && inserted) {
              summary[source].new++;
              // NOTIFICATION: Find all Admins & Superadmins
              const { data: adminRoles } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
              if (adminRoles && adminRoles.length > 0) {
                const notifs = adminRoles.map((a: any) => ({
                  user_id: a.user_id, title: `New ${source} lead`,
                  message: `${inserted.full_name} just messaged via ${source}.`, type: "lead",
                }));
                await supabase.from("notifications").insert(notifs);
              }
            }
          }
        }
      } catch (err) { console.error(`Failed ${source}:`, err.message); }
    }
    return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
