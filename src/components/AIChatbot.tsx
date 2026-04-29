import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { onOpenAIChatbot } from '@/lib/ai-chatbot-bus';

interface Msg { role: 'user' | 'assistant'; content: string; }

const QUICK_PROMPTS = [
  'How do I add a new client with passport OCR?',
  'Draft a WhatsApp follow-up for a Schengen visa client',
  'Explain UAE sick leave payroll rules with an example',
  'Write a quotation summary for a 5-day Dubai tour package',
  'How does the late deduction work? Show me the formula',
  'Steps to approve an employee leave request',
];

const STORAGE_KEY = 'nawi-ai-chat-history';

export default function AIChatbot({ hideFloatingButton = false }: { hideFloatingButton?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => onOpenAIChatbot(() => setOpen(true)), []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch {}
  }, [messages]);

  const clear = () => { setMessages([]); localStorage.removeItem(STORAGE_KEY); };

  const send = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;
    const newMsgs: Msg[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ai-assistant`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ messages: newMsgs }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({ error: 'Request failed' }));
        setMessages([...newMsgs, { role: 'assistant', content: `⚠️ ${errPayload.error || 'AI request failed'}` }]);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = '';
      let buffer = '';
      let streamDone = false;
      setMessages([...newMsgs, { role: 'assistant', content: '' }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { streamDone = true; break; }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: assistant };
                return copy;
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e.message || 'Network error'}` }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); setLoading(false); };

  return (
    <>
      {!open && !hideFloatingButton && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-elevated hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
          title="Ask Nawi AI" aria-label="Open AI Assistant">
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[min(94vw,440px)] h-[min(85vh,640px)] bg-card border border-border rounded-2xl shadow-elevated flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold font-display flex items-center gap-1.5">
                Nawi AI <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary">PRO</span>
              </p>
              <p className="text-[11px] text-muted-foreground truncate">Advanced CRM assistant • UAE travel expert</p>
            </div>
            {messages.length > 0 && (
              <button onClick={clear} className="text-muted-foreground hover:text-destructive p-1" title="Clear chat" aria-label="Clear">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="text-sm text-foreground bg-primary/5 border border-primary/10 rounded-xl p-3">
                  👋 Hi! I'm <b>Nawi AI</b>, your CRM expert. Ask me anything about clients, payroll, leave, quotations, UAE labor rules, or visa workflows. I can also draft messages and explain features step-by-step.
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Try one:</p>
                <div className="grid gap-2">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => send(p)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm break-words ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap'
                    : 'bg-muted text-foreground rounded-bl-md'
                }`}>
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:my-2 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-code:text-xs prose-code:bg-background/60 prose-code:px-1 prose-code:rounded prose-pre:bg-background prose-pre:text-xs prose-pre:my-2 prose-table:text-xs">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )
                  ) : m.content}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-border bg-background/40">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Ask anything about the CRM…" disabled={loading}
                className="input-nawi flex-1 text-sm" />
              {loading ? (
                <button onClick={stop} className="btn-primary px-3 bg-destructive hover:bg-destructive/90" title="Stop">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()} className="btn-primary px-3 disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Powered by Gemini 2.5 Pro • Verify important details</p>
          </div>
        </div>
      )}
    </>
  );
}
