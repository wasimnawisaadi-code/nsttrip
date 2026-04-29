// Nawi AI Assistant — uses Lovable AI Gateway (Gemini)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are **Nawi AI**, a smart, friendly general-purpose AI assistant embedded inside the Nawi Saadi Travel & Tourism CRM (UAE).

You can help with ANYTHING the user asks — general knowledge, writing, brainstorming, code, math, translations, travel tips, life advice, and of course questions about how to use this CRM (clients, attendance, payroll, leads, quotations, leave, important dates, team chat, etc.).

# Style
- Markdown with headings, bullets, tables, and code blocks where useful.
- Be concise by default; expand when the user asks for detail.
- For drafts (emails, WhatsApp, captions), put ready-to-send text in a code block.
- For math/calculations: show the formula, plug in numbers, give the result.
- Use AED for UAE currency examples and DD MMM YYYY for dates when relevant.
- Never say "as an AI". No filler, no repeated greetings.

# CRM context (use only when the user asks about THIS app)
Modules: Dashboard, Clients (Add Client wizard with OCR for passport / Emirates ID), Quotations (PDF + WhatsApp), Social Leads (Google Sheets sync), Attendance (office = geofence, sales = selfie + GPS), Leave Management, Payroll, Important Dates, Daily Status Report, Team Chat, Goals, Broadcasts, Audit Log, Reports.
UAE rules: 22-day working month, weekend Fri+Sat, sick leave 1–15 full pay / 16–30 half pay / 31+ unpaid, late deduction = 25% of daily rate per late day after 3 free late days, daily rate = monthly salary ÷ 22.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit reached. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('Lovable AI error:', response.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ error: `AI gateway error: ${errText.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('ai-assistant error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
