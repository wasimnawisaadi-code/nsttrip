// Daily job: scan client.important_dates, create reminder notifications at -3 and -1 day
// Skips dates that are silenced via date_reminder_prefs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECURRING = new Set(["birthday", "anniversary"]);
function detectCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("birthday") || n.includes("birth")) return "birthday";
  if (n.includes("anniversary") || n.includes("wedding")) return "anniversary";
  if (n.includes("passport")) return "passport";
  if (n.includes("visa")) return "visa";
  if (n.includes("emirates") || n.includes("eid")) return "emiratesId";
  if (n.includes("medical") || n.includes("insurance")) return "medical";
  if (n.includes("travel") || n.includes("flight")) return "travel";
  return "other";
}

function daysUntil(dateStr: string, recurring: boolean): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const src = new Date(dateStr);
  if (isNaN(src.getTime())) return Infinity;
  let target = src;
  if (recurring) {
    target = new Date(today.getFullYear(), src.getMonth(), src.getDate());
    if (target < today) target.setFullYear(today.getFullYear() + 1);
  }
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let created = 0, skipped = 0;

  try {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, mobile, assigned_to, created_by, important_dates");

    const { data: prefs } = await supabase
      .from("date_reminder_prefs")
      .select("client_id, date_label, silenced, last_reminder_sent_at");

    const prefMap = new Map<string, any>();
    (prefs || []).forEach((p: any) => prefMap.set(`${p.client_id}::${p.date_label}`, p));

    const todayKey = new Date().toISOString().slice(0, 10);

    for (const c of (clients as any[]) || []) {
      const dates = (c.important_dates || {}) as Record<string, string>;
      for (const [label, val] of Object.entries(dates)) {
        if (!val || label === "passportNo") continue;
        const cat = detectCategory(label);
        const days = daysUntil(val, RECURRING.has(cat));
        if (days !== 1 && days !== 3) continue;

        const pref = prefMap.get(`${c.id}::${label}`);
        if (pref?.silenced) { skipped++; continue; }
        // Don't double-send the same day
        if (pref?.last_reminder_sent_at?.startsWith(todayKey)) { skipped++; continue; }

        const recipientIds = [c.assigned_to, c.created_by].filter(Boolean);
        const { data: admins } = await supabase
          .from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
        for (const a of admins || []) recipientIds.push(a.user_id);

        const unique = Array.from(new Set(recipientIds));
        const title = `Reminder: ${label} for ${c.name} ${days === 1 ? "tomorrow" : "in 3 days"}`;
        const message = `${label} (${val}) for client ${c.name} — ${days === 1 ? "1 day" : "3 days"} left. Mobile: ${c.mobile || "—"}.`;

        const notifs = unique.map(uid => ({
          user_id: uid, client_id: c.id, title, message, type: "important_date",
        }));
        if (notifs.length) {
          await supabase.from("notifications").insert(notifs);
          created += notifs.length;
        }

        // Upsert pref so we don't repeat today
        await supabase.from("date_reminder_prefs").upsert({
          client_id: c.id, date_label: label,
          silenced: pref?.silenced || false,
          last_reminder_sent_at: new Date().toISOString(),
        }, { onConflict: "client_id,date_label" });
      }
    }

    return new Response(JSON.stringify({ success: true, created, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-date-reminders error", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
