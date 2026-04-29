// Nawi AI Assistant — directly calls Gemini API (no Lovable Gateway needed)
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

    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured in Edge Functions' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents,
        generationConfig: {
          temperature: 0.4
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ error: `Gemini error: ${errText.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reader = response.body!.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            let nlIdx: number;
            while ((nlIdx = buffer.indexOf('\n')) !== -1) {
              let line = buffer.slice(0, nlIdx).trim();
              buffer = buffer.slice(nlIdx + 1);
              
              if (!line.startsWith('data: ')) continue;
              const dataStr = line.slice(6);
              
              try {
                const json = JSON.parse(dataStr);
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  const openAiFormat = {
                    choices: [{ delta: { content: text } }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAiFormat)}\n\n`));
                }
              } catch (e) {
                // Ignore parsing issues for partial JSON chunks
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e: any) {
    console.error('ai-assistant error', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
