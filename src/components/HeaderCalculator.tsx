import { useState } from 'react';
import { Calculator as CalcIcon } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const BTNS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

export default function HeaderCalculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('0');

  const evaluate = (s: string): string => {
    try {
      const clean = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      if (!/^[0-9+\-*/.() %]*$/.test(clean)) return 'Err';
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
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-2 hover:bg-muted rounded-lg transition-colors" title="Calculator" aria-label="Calculator">
          <CalcIcon className="w-5 h-5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
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
      </PopoverContent>
    </Popover>
  );
}
