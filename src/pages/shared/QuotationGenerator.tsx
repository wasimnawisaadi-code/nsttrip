import { useState, useEffect } from 'react';
import { Plus, Trash2, Download, Save, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { generateDisplayId, auditLog, formatCurrency } from '@/lib/supabase-service';
import jsPDF from 'jspdf';

export default function QuotationGenerator() {
  const { user, profile } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', amount: 0 }]);
  const [payableAmount, setPayableAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('*').then(({ data }) => setClients(data || []));
  }, []);

  const client = clients.find((c: any) => c.id === clientId);
  const quotedPrice = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const profit = quotedPrice - payableAmount;

  const addLine = () => setLineItems([...lineItems, { description: '', amount: 0 }]);
  const removeLine = (i: number) => setLineItems(lineItems.filter((_, j) => j !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lineItems];
    (updated[i] as any)[field] = field === 'amount' ? Number(value) : value;
    setLineItems(updated);
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const { drawBrandHeader, drawBrandFooter } = await import('@/lib/pdf-helpers');
    const headerBottom = await drawBrandHeader(doc, 'Quotation');
    let y = headerBottom + 4;
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 140, y);
    if (validUntil) { y += 5; doc.text(`Valid Until: ${new Date(validUntil).toLocaleDateString('en-GB')}`, 140, y); }
    y = headerBottom + 12;
    if (client) {
      doc.setFontSize(9); doc.setTextColor(120); doc.text('PREPARED FOR', 18, y); doc.setTextColor(0); doc.setFontSize(10);
      y += 5; doc.text(client.name, 18, y);
      y += 5; doc.text(`${client.mobile || ''}${client.email ? ' • ' + client.email : ''}`, 18, y);
      if (client.service) { y += 5; doc.text(`Service: ${client.service}`, 18, y); }
    }
    y += 10;
    doc.setFillColor(5, 47, 89); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.setFontSize(9);
    doc.text('DESCRIPTION', 22, y + 5.5); doc.text('AMOUNT (AED)', 188, y + 5.5, { align: 'right' });
    y += 12; doc.setTextColor(0);
    lineItems.forEach((li) => { if (!li.description) return; doc.text(li.description, 22, y); doc.text(li.amount.toLocaleString(), 188, y, { align: 'right' }); y += 7; });
    doc.setDrawColor(220); doc.line(18, y, 192, y); y += 8;
    doc.setFontSize(11); doc.setTextColor(5, 47, 89);
    doc.text(`TOTAL QUOTED PRICE: AED ${quotedPrice.toLocaleString()}`, 18, y);
    if (notes) { y += 12; doc.setFontSize(9); doc.setTextColor(100); doc.text(`Notes: ${notes}`, 18, y); }
    await drawBrandFooter(doc, profile?.name);
    doc.save(`Quotation_${client?.name || 'draft'}.pdf`);
  };

  const handleSave = async () => {
    if (!clientId || !user) return;
    const displayId = await generateDisplayId('QUO');
    await supabase.from('quotations').insert({
      display_id: displayId, client_id: clientId, client_name: client?.name || '', service: client?.service || '',
      line_items: lineItems as any, quoted_price: quotedPrice, payable_amount: payableAmount, profit, status: 'Draft',
      generated_by: user.id, valid_until: validUntil || null,
    });
    await auditLog('quotation_generated', 'quotation', displayId, { clientId });
    setSaved(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold font-display">Quotation Generator</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi space-y-4">
          <div><label className="block text-sm font-medium mb-1">Client *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-nawi">
              <option value="">Select client...</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.display_id})</option>)}
            </select>
          </div>
          {client && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
              <div><span className="text-muted-foreground">Service:</span> {client.service}</div>
              <div><span className="text-muted-foreground">Mobile:</span> {client.mobile}</div>
            </div>
          )}
          <div><label className="block text-sm font-medium mb-1">Valid Until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input-nawi" /></div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium">Line Items</label><button onClick={addLine} className="btn-outline text-xs py-1"><Plus className="w-3 h-3" /> Add</button></div>
            {lineItems.map((li, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} className="input-nawi flex-1" placeholder="Description" />
                <input type="number" value={li.amount || ''} onChange={(e) => updateLine(i, 'amount', e.target.value)} className="input-nawi w-28" placeholder="Amount" />
                {lineItems.length > 1 && <button onClick={() => removeLine(i)} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Quoted Price (auto)</label><input value={quotedPrice} readOnly className="input-nawi bg-muted" /></div>
            <div><label className="block text-sm font-medium mb-1">Payable Amount</label><input type="number" value={payableAmount || ''} onChange={(e) => setPayableAmount(Number(e.target.value))} className="input-nawi" /></div>
          </div>
          <div className={`p-3 rounded-lg text-center font-bold font-display text-lg ${profit >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            Profit: {formatCurrency(profit)}
          </div>
          <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-nawi" rows={2} /></div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saved}><Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save'}</button>
            <button onClick={generatePDF} className="btn-secondary flex-1"><Download className="w-4 h-4" /> PDF</button>
            <button onClick={() => {
              if (!client) return;
              const text = `Dear ${client.name},%0A%0AThank you for your enquiry. Here is your quotation from *Nawi Saadi Travel & Tourism*:%0A%0A${lineItems.filter(li => li.description).map(li => `• ${li.description}: AED ${li.amount.toLocaleString()}`).join('%0A')}%0A%0A*Total: AED ${quotedPrice.toLocaleString()}*${validUntil ? `%0AValid Until: ${new Date(validUntil).toLocaleDateString('en-GB')}` : ''}${notes ? `%0A%0ANotes: ${notes}` : ''}%0A%0ARegards,%0ANawi Saadi Travel & Tourism`;
              const phone = client.mobile?.replace(/[^0-9]/g, '') || '';
              window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
            }} className="btn-outline flex-1 text-success border-success hover:bg-success/10"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
          </div>
        </div>
        <div className="card-nawi bg-muted/30">
          <div className="border border-border rounded-lg bg-background p-6 text-sm">
            <h3 className="text-lg font-bold text-primary font-display">NAWI SAADI TRAVEL & TOURISM</h3>
            <p className="text-xs text-muted-foreground mb-4">Travel & Tourism Services</p>
            <hr className="border-border mb-4" />
            <p className="font-bold text-primary mb-2">QUOTATION</p>
            <p className="text-xs text-muted-foreground">Date: {new Date().toLocaleDateString('en-GB')}</p>
            {validUntil && <p className="text-xs text-muted-foreground">Valid Until: {new Date(validUntil).toLocaleDateString('en-GB')}</p>}
            {client && (
              <div className="mt-3 mb-4">
                <p className="text-xs text-muted-foreground">PREPARED FOR:</p>
                <p className="font-medium">{client.name}</p>
                <p className="text-xs">{client.mobile} {client.email && `• ${client.email}`}</p>
              </div>
            )}
            <div className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-t flex justify-between"><span>Description</span><span>Amount</span></div>
            <div className="border border-t-0 border-border rounded-b divide-y divide-border">
              {lineItems.filter(li => li.description).map((li, i) => (
                <div key={i} className="flex justify-between px-3 py-1.5 text-xs"><span>{li.description}</span><span>AED {li.amount.toLocaleString()}</span></div>
              ))}
            </div>
            <div className="mt-3 text-right font-bold text-primary">Total: AED {quotedPrice.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
