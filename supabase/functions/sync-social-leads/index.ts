// PERFECT Social Leads Sync - FINAL VERSION
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

async function getSheetsAccessToken(): Promise<{ token: string; email: string } | null> {
  const saJson = Deno.env.get('GOOGLE_SHEETS_SA_JSON');
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    const b64 = (obj: any) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })}`;
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const token = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: token }) });
    const data = await res.json();
    return { token: data.access_token, email: sa.client_email };
  } catch (e) { console.error("Token exchange failed", e); return null; }
}

async function fetchSheet(id: string, gid: string, saInfo: { token: string; email: string } | null) {
  let rows: string[][] = [];
  if (saInfo && saInfo.token) {
    try {
      const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${saInfo.token}` } })).json();
      const tab = meta.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))?.properties?.title;
      if (tab) {
        const data = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${tab}`, { headers: { Authorization: `Bearer ${saInfo.token}` } })).json();
        if (data.values) rows = data.values;
      }
    } catch (e) { console.error("API Fetch failed", e); }
  }
  if (!rows || rows.length === 0) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    const res = await fetch(csvUrl);
    if (res.url.includes("ServiceLogin")) throw new Error(`Access Denied. Ensure ${saInfo?.email || "the service email"} is invited.`);
    const text = await res.text();
    let r: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else { if (c === '"') inQ = true; else if (c === ",") { r.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i+1] === "\n") i++; r.push(cur); cur = ""; if (r.some(v => v.trim())) rows.push(r); r = []; } else cur += c; }
    }
    if (cur || r.length) { r.push(cur); if (r.some(v => v.trim())) rows.push(r); }
  }
  return rows;
}

function getVal(row: string[], headers: string[], keys: string[], fallbackIdx: number): string {
  for (const k of keys) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === k.toLowerCase().trim());
    if (idx !== -1 && row[idx]) return row[idx].trim();
  }
  return (row[fallbackIdx] || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  const { data: adminRoles } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
  const adminIds = (adminRoles || []).map(a => a.user_id);
  const pendingNotifs: any[] = [];
  
  const saInfo = await getSheetsAccessToken();
  const summary: any = { whatsapp: { total: 0, new: 0, updated: 0 }, instagram: { total: 0, new: 0, updated: 0 }, messenger: { total: 0, new: 0, updated: 0 } };

  for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
    try {
      const allRows = await fetchSheet(SHEETS[source].id, SHEETS[source].gid, saInfo);
      if (!allRows || allRows.length < 1) continue;
      let hIdx = allRows.findIndex(r => r.some(c => (c || "").toLowerCase().includes("contact id") || (c || "").toLowerCase().includes("first name")));
      if (hIdx === -1) hIdx = 0;
      const headers = allRows[hIdx].map(h => (h || "").trim());
      const dataRows = allRows.slice(hIdx + 1);
      summary[source].total = dataRows.length;
      
      for (const r of dataRows) {
        let id = ""; let name = ""; let username = ""; let phone = "";
        if (source === "whatsapp") { phone = getVal(r, headers, ["phone", "whatsapp id"], 4) || getVal(r, headers, ["whatsapp id"], 10); id = getVal(r, headers, ["contact id", "id"], 6) || phone; }
        else if (source === "instagram") { username = getVal(r, headers, ["username", "handle"], 12); id = getVal(r, headers, ["contact id", "id"], 6) || username; }
        else { id = getVal(r, headers, ["contact id", "id", "psid"], 6); }
        if (!id || id.toLowerCase() === "contact id" || id === "null") continue;
        const first = getVal(r, headers, ["first name"], 0); const last = getVal(r, headers, ["last name"], 1); const full = getVal(r, headers, ["full name", "name", "column 3"], 2);
        name = full; if (!name || name === "Full Name" || name.toLowerCase().includes("nawisaadi")) { name = (first + " " + last).trim() || username || "Unnamed Lead"; }
        const lead = { source, unique_key: id, full_name: name, phone: phone || null, username: username || null, raw: r, last_interaction: new Date().toISOString(), updated_at: new Date().toISOString() };
        const { data: existing } = await supabase.from("social_leads").select("id").eq("source", source).eq("unique_key", id).maybeSingle();
        if (existing) { await supabase.from("social_leads").update(lead).eq("id", existing.id); summary[source].updated++; }
        else {
          const { data: idData } = await supabase.rpc("generate_display_id", { prefix: "LEAD" });
          const { data: ins } = await supabase.from("social_leads").insert({ ...lead, display_id: (idData as string) || `LEAD-${Date.now()}`, status: "NEW" }).select().single();
          if (ins) {
            summary[source].new++;
            adminIds.forEach(uid => { pendingNotifs.push({ user_id: uid, title: `New ${source} lead`, message: `${ins.full_name} messaged.`, type: "lead" }); });
          }
        }
      }
    } catch (e) { summary[source].error = e.message; }
  }
  if (pendingNotifs.length > 0) await supabase.from("notifications").insert(pendingNotifs.slice(0, 50));
  return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
