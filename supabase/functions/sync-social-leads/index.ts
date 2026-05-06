// Sync leads from Google Sheets via Service Account (GOOGLE_SHEETS_SA_JSON)
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
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
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
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
    }))}`;
    const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${b64url(sig)}`;
    const tokRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
    if (!tokRes.ok) return null;
    const tok = await tokRes.json();
    cachedToken = { token: tok.access_token, exp: Date.now() + (tok.expires_in * 1000) };
    return tok.access_token;
  } catch { return null; }
}

async function fetchViaSheetsApi(spreadsheetId: string, gid: string, token: string): Promise<string[][] | null> {
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    const tab = meta.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))?.properties?.title;
    if (!tab) return null;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    return json.values || [];
  } catch { return null; }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); if (row.some(v => v.trim())) rows.push(row); }
  return rows;
}

async function fetchAndParse(spreadsheetId: string, gid: string, token: string | null): Promise<Record<string, string>[]> {
  let rows: string[][] = [];
  if (token) rows = (await fetchViaSheetsApi(spreadsheetId, gid, token)) || [];
  if (rows.length < 2) {
    const res = await fetch(csvUrl(spreadsheetId, gid), { redirect: "follow" });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    rows = parseCSV(await res.text());
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h, i) => {
    const val = (h || "").trim() || `col_${i}`;
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
  const lcs: any = {};
  Object.keys(obj).forEach(k => lcs[k.toLowerCase()] = obj[k]);
  for (const k of keys) if (lcs[k.toLowerCase()]) return lcs[k.toLowerCase()].trim();
  return "";
}

function buildLead(source: "whatsapp" | "instagram" | "messenger", row: Record<string, string>) {
  const keys = Object.keys(row);
  const first = pick(row, "First Name", "first_name");
  const last = pick(row, "Last Name", "last_name");
  const full = pick(row, "Full Name", "Name") || `${first} ${last}`.trim();
  let unique_key = ""; let phone = ""; let username = "";
  if (source === "whatsapp") {
    phone = pick(row, "Phone", "WhatsApp ID", "WA ID");
    unique_key = pick(row, "Contact ID", "Contact Id", "WhatsApp ID", "Phone") || phone;
  } else if (source === "instagram") {
    username = pick(row, "Username", "Instagram Username", "Handle");
    if (!username) username = row[keys[12]] || "";
    unique_key = pick(row, "Contact ID", "Contact Id", "Instagram ID") || username;
  } else {
    unique_key = pick(row, "Contact ID", "Contact Id", "Messenger ID", "PSID");
  }
  if (!unique_key || unique_key === "null") return null;
  return {
    source, unique_key, first_name: first || null, last_name: last || null, full_name: full || "Unnamed",
    phone: phone || null, username: username || null, page_id: pick(row, "Page ID", "Page Id") || null,
    status: "NEW", raw: row, last_interaction: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary: any = { whatsapp: { new: 0, error: null }, instagram: { new: 0, error: null }, messenger: { new: 0, error: null } };
  try {
    const token = await getSheetsAccessToken();
    for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      try {
        const { id, gid } = SHEETS[source];
        const rows = await fetchAndParse(id, gid, token);
        for (const row of rows) {
          const lead = buildLead(source, row);
          if (!lead) continue;
          const { data: existing } = await supabase.from("social_leads").select("id").eq("source", source).eq("unique_key", lead.unique_key).maybeSingle();
          if (!existing) {
            const { data: idData } = await supabase.rpc("generate_display_id", { prefix: "LEAD" });
            const { data: ins, error } = await supabase.from("social_leads").insert({ ...lead, display_id: (idData as string) || `LEAD-${Date.now()}` }).select().single();
            if (ins) {
              summary[source].new++;
              const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
              if (admins) {
                const notifs = admins.map((a: any) => ({ user_id: a.user_id, title: `New ${source} lead`, message: `${ins.full_name} messaged via ${source}.`, type: "lead" }));
                await supabase.from("notifications").insert(notifs);
              }
            }
          }
        }
      } catch (e) { summary[source].error = e.message; }
    }
    return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: corsHeaders }); }
});
