// Precision Social Leads Sync
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

async function getSheetsAccessToken(): Promise<string | null> {
  const saJson = Deno.env.get('GOOGLE_SHEETS_SA_JSON');
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    const b64 = (obj: any) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Math.floor(Date.now() / 1000);
    const jwt = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })}`;
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(jwt));
    const token = `${jwt}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: token }) });
    return (await res.json()).access_token;
  } catch { return null; }
}

async function fetchSheet(id: string, gid: string, token: string | null) {
  if (token) {
    try {
      const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const tab = meta.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))?.properties?.title;
      if (tab) {
        const data = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${tab}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (data.values) return data.values;
      }
    } catch {}
  }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const res = await fetch(csvUrl);
  const text = await res.text();
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i+1] === "\n") i++; row.push(cur); cur = ""; if (row.some(v => v.trim())) rows.push(row); row = []; } else cur += c; }
  }
  if (cur || row.length) { row.push(cur); if (row.some(v => v.trim())) rows.push(row); }
  return rows;
}

function getVal(row: string[], headers: string[], keys: string[], fallbackIdx: number): string {
  for (const k of keys) {
    const idx = headers.findIndex(h => h.toLowerCase() === k.toLowerCase());
    if (idx !== -1 && row[idx]) return row[idx].trim();
  }
  return (row[fallbackIdx] || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = await getSheetsAccessToken();
  const summary: any = { whatsapp: { total: 0, new: 0, updated: 0 }, instagram: { total: 0, new: 0, updated: 0 }, messenger: { total: 0, new: 0, updated: 0 } };

  for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
    try {
      const rows = await fetchSheet(SHEETS[source].id, SHEETS[source].gid, token);
      if (rows.length < 2) continue;
      const headers = rows[0].map(h => (h || "").trim());
      summary[source].total = rows.length - 1;

      for (const r of rows.slice(1)) {
        let id = ""; let name = ""; let username = ""; let phone = "";
        
        if (source === "whatsapp") {
          phone = getVal(r, headers, ["phone", "wa id", "whatsapp"], 0);
          id = getVal(r, headers, ["contact id", "id"], 6) || phone;
        } else if (source === "instagram") {
          username = getVal(r, headers, ["username", "handle"], 12);
          id = getVal(r, headers, ["contact id", "id"], 6) || username;
        } else {
          id = getVal(r, headers, ["contact id", "id", "psid"], 6);
        }
        
        // CRITICAL: Ignore headers or empty IDs
        if (!id || id.toLowerCase() === "contact id" || id === "null") continue;
        
        const first = getVal(r, headers, ["first name"], 0);
        const last = getVal(r, headers, ["last name"], 1);
        name = getVal(r, headers, ["full name", "name"], 2);
        if (!name || name === "Full Name" || name.toLowerCase().includes("nawisaadi")) {
           name = (first + " " + last).trim() || username || "Unnamed Lead";
        }

        const lead = { 
          source, unique_key: id, full_name: name, phone: phone || null, username: username || null, 
          raw: r, updated_at: new Date().toISOString() 
        };

        const { data: existing } = await supabase.from("social_leads").select("id").eq("source", source).eq("unique_key", id).maybeSingle();

        if (existing) {
          await supabase.from("social_leads").update(lead).eq("id", existing.id);
          summary[source].updated++;
        } else {
          const { data: idData } = await supabase.rpc("generate_display_id", { prefix: "LEAD" });
          const { data: ins } = await supabase.from("social_leads").insert({ ...lead, display_id: (idData as string) || `LEAD-${Date.now()}` }).select().single();
          if (ins) {
            summary[source].new++;
            const { data: adminRoles } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
            if (adminRoles) {
              const notifs = adminRoles.map((a: any) => ({ user_id: a.user_id, title: `New ${source} lead`, message: `${ins.full_name} messaged via ${source}.`, type: "lead" }));
              await supabase.from("notifications").insert(notifs);
            }
          }
        }
      }
    } catch (e) { summary[source].error = e.message; }
  }
  return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
