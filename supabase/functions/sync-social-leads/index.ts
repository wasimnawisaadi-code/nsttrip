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

const GARBAGE = new Set([
  "FALSE","TRUE","Unnamed","\\","First Name","Page Name","full name","name",
  "phone","username","contact id","psid","id","user_id","","-","N/A","n/a",
]);

// Normalise a string to a plain digits-only key (strip +, spaces, dashes)
function normaliseId(raw: string): string {
  return raw.trim().replace(/[\s\+\-]/g, "");
}

// True if s looks like a numeric ID or phone (6-20 digits after normalising)
function isNumericId(s: string): boolean {
  const n = normaliseId(s);
  return /^\d{6,20}$/.test(n);
}

// ── Google service-account JWT auth ──────────────────────────────────────────
async function getSheetsAccessToken(): Promise<{ token: string } | null> {
  const saJson = Deno.env.get("GOOGLE_SHEETS_SA_JSON");
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    const b64url = (obj: any) =>
      btoa(JSON.stringify(obj)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    const now = Math.floor(Date.now() / 1000);
    const header  = b64url({ alg:"RS256", typ:"JWT" });
    const payload = b64url({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600, iat: now,
    });
    const input = `${header}.${payload}`;
    const pem = sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g,"")
      .replace(/-----END PRIVATE KEY-----/g,"")
      .replace(/\s+/g,"");
    const key = await crypto.subtle.importKey(
      "pkcs8",
      Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
      { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    const jwt = `${input}.${sig}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method:"POST",
      body: new URLSearchParams({ grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion:jwt }),
    });
    const data = await res.json();
    if (!data.access_token) { console.warn("SA token empty:", data); return null; }
    return { token: data.access_token };
  } catch(e) { console.error("SA auth error:", e); return null; }
}

// ── CSV parser (handles quoted fields, \r\n, missing trailing newline) ────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(cur); cur = ""; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(cur); cur = "";
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      } else { cur += c; }
    }
  }
  // ← CRITICAL: flush last row even without trailing newline
  row.push(cur);
  if (row.some(v => v.trim())) rows.push(row);

  return rows;
}

// ── Fetch sheet rows (SA API → public CSV fallback) ──────────────────────────
async function fetchSheet(id: string, gid: string, token: string | null): Promise<string[][]> {
  // Try Sheets API
  if (token) {
    try {
      const meta = await (await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`,
        { headers:{ Authorization:`Bearer ${token}` } }
      )).json();
      const tab = meta.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid))?.properties?.title;
      if (tab) {
        const range = encodeURIComponent(tab);
        const data = await (await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,
          { headers:{ Authorization:`Bearer ${token}` } }
        )).json();
        if (Array.isArray(data.values) && data.values.length > 1) {
          console.log(`Sheets API ok, ${data.values.length} rows`);
          return data.values;
        }
      }
    } catch(e) { console.warn("Sheets API failed:", e); }
  }

  // CSV fallback
  console.log("Falling back to CSV export…");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error(`CSV export HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`CSV parsed, ${rows.length} rows`);
  return rows;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const saInfo = await getSheetsAccessToken();
  const token  = saInfo?.token ?? null;

  const summary: Record<string, { total:number; new:number; updated:number; skipped:number; error?:string }> = {
    whatsapp:  { total:0, new:0, updated:0, skipped:0 },
    instagram: { total:0, new:0, updated:0, skipped:0 },
    messenger: { total:0, new:0, updated:0, skipped:0 },
  };

  for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
    try {
      const allRows = await fetchSheet(SHEETS[source].id, SHEETS[source].gid, token);
      if (!allRows || allRows.length < 2) {
        console.warn(`[${source}] no data rows`);
        continue;
      }

      const headers  = allRows[0].map(h => (h || "").trim().toLowerCase());
      const dataRows = allRows.slice(1);
      console.log(`[${source}] ${dataRows.length} data rows | headers:`, headers);

      // ── Column index detection (broad matching) ───────────────────────────
      const idIdx       = headers.findIndex(h => /contact.?id|psid|^id$|user.?id/.test(h));
      const nameIdx     = headers.findIndex(h => /full.?name|^name$|first.?name/.test(h));
      const phoneIdx    = headers.findIndex(h => /phone|whatsapp|mobile|tel/.test(h));
      const usernameIdx = headers.findIndex(h => /username|ig.?username|handle/.test(h));
      const dateIdx     = headers.findIndex(h => /last.?interaction|last.?seen|date|timestamp|time/.test(h));

      for (let rowNum = 0; rowNum < dataRows.length; rowNum++) {
        const r = dataRows[rowNum];

        // ── 1. Unique key: ID col → phone col → scan all cells → row-hash ──
        let uniqueKey = "";

        if (idIdx >= 0 && r[idIdx]?.trim()) {
          uniqueKey = normaliseId(r[idIdx]);
        }

        if (!uniqueKey && phoneIdx >= 0 && r[phoneIdx]?.trim()) {
          const cleaned = normaliseId(r[phoneIdx]);
          if (/^\d{6,20}$/.test(cleaned)) uniqueKey = cleaned;
        }

        if (!uniqueKey) {
          // Scan every cell for something that looks like a phone/ID
          for (const cell of r) {
            if (!cell?.trim()) continue;
            const cleaned = normaliseId(cell);
            if (/^\d{7,20}$/.test(cleaned)) { uniqueKey = cleaned; break; }
          }
        }

        // Last resort: use a stable hash of source + row index + name
        // so the row still gets inserted (better than silently skipping)
        if (!uniqueKey) {
          const nameCell = nameIdx >= 0 ? (r[nameIdx] || "") : (r[0] || "");
          if (nameCell.trim().length > 1) {
            uniqueKey = `${source}-row${rowNum}-${nameCell.trim().slice(0,20).replace(/\s+/g,"")}`;
          } else {
            summary[source].skipped++;
            continue;
          }
        }

        // ── 2. Full name ──────────────────────────────────────────────────
        let fullName = "";
        if (nameIdx >= 0 && r[nameIdx]?.trim() && !GARBAGE.has(r[nameIdx].trim())) {
          fullName = r[nameIdx].trim();
        } else {
          // Pick first non-garbage, non-numeric, non-boolean text cell
          fullName = r.find(c =>
            c?.trim() &&
            !GARBAGE.has(c.trim()) &&
            !/^\d/.test(c.trim()) &&
            !["TRUE","FALSE","male","female","en_US","en_GB"].includes(c.trim()) &&
            !c.includes("nawisaadi") &&
            c.trim().length > 1
          )?.trim() || "";
        }

        // ── 3. Username ───────────────────────────────────────────────────
        let username = "";
        if (usernameIdx >= 0 && r[usernameIdx]?.trim()) {
          username = r[usernameIdx].trim();
        } else if (source === "instagram") {
          username = r.find(c =>
            c && /^[a-zA-Z0-9._]{3,30}$/.test(c) &&
            !c.includes(" ") && c !== "TRUE" && c !== "FALSE" && !GARBAGE.has(c)
          ) || "";
        }

        // ── 4. Phone ──────────────────────────────────────────────────────
        let phone = "";
        if (phoneIdx >= 0 && r[phoneIdx]?.trim()) {
          phone = r[phoneIdx].trim();
        }

        // ── 5. Last interaction date ──────────────────────────────────────
        let lastInteraction = new Date().toISOString();
        if (dateIdx >= 0 && r[dateIdx]?.trim()) {
          const parsed = new Date(r[dateIdx].trim());
          if (!isNaN(parsed.getTime())) lastInteraction = parsed.toISOString();
        }

        // Fallback name
        if (!fullName || fullName.length < 2) fullName = username || phone || uniqueKey;
        if (GARBAGE.has(fullName)) { summary[source].skipped++; continue; }

        // ── Upsert ────────────────────────────────────────────────────────
        // RULE: on UPDATE never touch status / assignment / employee fields
        const { data: existing } = await supabase
          .from("social_leads")
          .select("id, full_name, phone, username")
          .eq("source", source)
          .eq("unique_key", uniqueKey)
          .maybeSingle();

        if (existing) {
          const changed =
            existing.full_name !== fullName ||
            existing.phone     !== (phone    || null) ||
            existing.username  !== (username || null);

          if (changed) {
            const { error } = await supabase
              .from("social_leads")
              .update({
                full_name: fullName,
                phone: phone || null,
                username: username || null,
                last_interaction: lastInteraction,
                updated_at: new Date().toISOString(),
                // ❌ NEVER include: status, assigned_to, client_need, notes, etc.
              })
              .eq("id", existing.id);
            if (error) console.error(`Update ${uniqueKey}:`, error.message);
            else summary[source].updated++;
          } else {
            summary[source].skipped++;
          }
        } else {
          const { error } = await supabase
            .from("social_leads")
            .insert({
              source,
              unique_key: uniqueKey,
              full_name:  fullName,
              phone:      phone    || null,
              username:   username || null,
              last_interaction: lastInteraction,
              status:     "NEW",
              display_id: `LEAD-${Math.floor(Math.random() * 89999) + 10000}`,
            });
          if (error) console.error(`Insert ${uniqueKey}:`, error.message);
          else summary[source].new++;
        }
        summary[source].total++;
      }
    } catch(e: any) {
      console.error(`[${source}] fatal:`, e);
      summary[source].error = e.message;
    }
  }

  console.log("Sync done:", JSON.stringify(summary));
  return new Response(
    JSON.stringify({ success: true, summary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
