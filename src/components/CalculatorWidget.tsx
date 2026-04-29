import { useState } from 'react';
import { Calculator as CalcIcon, X } from 'lucide-react';

const BTNS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

const OPS: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' };

export default function CalculatorWidget() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('0');

  const evaluate = (s: string): string => {
    try {
      // Replace display ops with JS ops, sanitize
      const clean = s.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-');
      if (!/^[0-9+\-*/.() %]*$/.test(clean)) return 'Err';
      // Convert "%" to "/100"
      const expr2 = clean.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${expr2 || '0'})`)();
      if (typeof v !== 'number' || !isFinite(v)) return 'Err';
      return String(Math.round(v * 1e10) / 1e10);
    } catch { return 'Err'; }
  };

  const press = (b: string) => {
    if (b === 'C') { setExpr(''); setResult('0'); return; }
    if (b === '⌫') { const n = expr.slice(0, -1); setExpr(n); setResult(evaluate(n) || '0'); return; }
    if (b === '=') { setResult(evaluate(expr)); return; }
    if (b === '±') {
      if (!expr) return;
      const m = expr.match(/(-?\d+(?:\.\d+)?)$/);
      if (!m) return;
      const num = m[1];
      const flipped = num.startsWith('-') ? num.slice(1) : `-${num}`;
      const n = expr.slice(0, -num.length) + flipped;
      setExpr(n); setResult(evaluate(n));
      return;
    }
    const next = expr + b;
    setExpr(next);
    setResult(evaluate(next) || '0');
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-24 z-40 w-12 h-12 rounded-full bg-secondary text-secondary-foreground shadow-elevated hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
          title="Calculator" aria-label="Open Calculator">
          <CalcIcon className="w-5 h-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-24 z-40 w-72 bg-card border border-border rounded-2xl shadow-elevated p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold font-display flex items-center gap-2"><CalcIcon className="w-4 h-4 text-secondary" /> Calculator</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="bg-muted rounded-lg p-3 mb-2 text-right">
            <p className="text-xs text-muted-foreground h-4 truncate">{expr || ' '}</p>
            <p className="text-2xl font-bold font-display truncate">{result}</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BTNS.flat().map(b => {
              const isOp = ['÷', '×', '−', '+', '='].includes(b);
              const isFn = ['C', '±', '%', '⌫'].includes(b);
              return (
                <button key={b} onClick={() => press(b)}
                  className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                    b === '=' ? 'bg-primary text-primary-foreground hover:bg-primary/90' :
                    isOp ? 'bg-secondary/20 text-secondary hover:bg-secondary/30' :
                    isFn ? 'bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20' :
                    'bg-muted hover:bg-muted/70'
                  }`}>
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
