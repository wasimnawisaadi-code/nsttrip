// Refined Deep-Scan Social Leads Sync
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
    const jwtInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })}`;
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(jwtInput));
    const token = `${jwtInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: token }) });
    const data = await res.json();
    return { token: data.access_token, email: sa.client_email };
  } catch { return null; }
}

async function fetchSheet(id: string, gid: string, saInfo: { token: string; email: string } | null) {
  let rows: string[][] = [];
  if (saInfo) {
    try {
      const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${saInfo.token}` } })).json();
      const tab = meta.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))?.properties?.title;
      if (tab) {
        const data = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${tab}`, { headers: { Authorization: `Bearer ${saInfo.token}` } })).json();
        if (data.values) rows = data.values;
      }
    } catch {}
  }
  if (!rows || rows.length === 0) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const saInfo = await getSheetsAccessToken();
  const summary: any = { whatsapp: { total: 0, new: 0 }, instagram: { total: 0, new: 0 }, messenger: { total: 0, new: 0 } };

  // Hard delete previous garbage leads
  await supabase.from("social_leads").delete().in("full_name", ["FALSE", "TRUE", "Unnamed", "\\", "First Name", "Page Name", ""]);

  for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
    try {
      const allRows = await fetchSheet(SHEETS[source].id, SHEETS[source].gid, saInfo);
      if (!allRows || allRows.length < 1) continue;
      
      const dataRows = allRows.slice(1); // skip headers
      
      for (const r of dataRows) {
        let id = ""; let name = ""; let username = ""; let phone = "";
        
        // Find ID: 10-20 digit number
        id = r.find(c => c && /^\d{10,20}$/.test(c.trim())) || "";
        if (!id) continue;

        // Find Name: The first column that has text (not just numbers/dates/booleans)
        // Usually the first few columns are First Name, Last Name, Full Name
        // We'll join the first two non-empty text strings
        const textCols = r.filter(c => c && c.trim() && !/^\d/.test(c.trim()) && !["TRUE", "FALSE", "male", "female", "en_US", "en_GB", "English"].includes(c.trim()) && !c.includes("nawisaadi"));
        
        if (textCols.length > 0) {
          name = textCols[0].trim();
          // If the second column is also text, it might be the last name, let's combine if it makes sense, 
          // or if the second column is full name, use that.
          if (textCols.length > 1 && textCols[1].includes(name)) {
             name = textCols[1].trim(); // It was full name
          } else if (textCols.length > 1 && textCols[0].length < 15 && textCols[1].length < 15) {
             // Combine first and last name if they are short
             name = `${textCols[0]} ${textCols[1]}`.trim();
          }
        }
        
        // Find Username (for IG)
        if (source === "instagram") {
          username = r.find(c => c && /^[a-zA-Z0-9._]{3,20}$/.test(c) && !c.includes(" ") && c !== "TRUE" && c !== "FALSE") || "";
        }

        if (!name || name.length < 2) name = username || id; // Fallback to username or ID if name is truly missing

        const lead = { source, unique_key: id, full_name: name, phone: phone || null, username: username || null, raw: r, last_interaction: new Date().toISOString(), updated_at: new Date().toISOString(), status: "NEW" };
        const { data: existing } = await supabase.from("social_leads").select("id").eq("source", source).eq("unique_key", id).maybeSingle();
        if (existing) { await supabase.from("social_leads").update(lead).eq("id", existing.id); }
        else {
          await supabase.from("social_leads").insert({ ...lead, display_id: `LEAD-${Math.floor(Math.random() * 89999) + 10000}` });
          summary[source].new++;
        }
      }
    } catch (e) { summary[source].error = e.message; }
  }
  return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
