import { useState, useEffect } from 'react';
import { MessageCircle, X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  mobile: string;
  defaultMessage: string;
  title?: string;
}

/**
 * Editable WhatsApp template modal.
 * User can tweak the message before opening WhatsApp via wa.me.
 */
export default function WhatsAppTemplateModal({ open, onClose, mobile, defaultMessage, title = 'Send WhatsApp Message' }: Props) {
  const [message, setMessage] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) setMessage(defaultMessage); }, [open, defaultMessage]);

  if (!open) return null;

  const send = () => {
    const phone = (mobile || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
    if (!phone) {
      toast.error('No mobile number available');
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    onClose();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-success/10 text-success"><MessageCircle className="w-4 h-4" /></div>
            <h2 className="text-base font-bold font-display">{title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">To: {mobile || 'No mobile'}</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input-nawi"
          rows={7}
          placeholder="Type your message..."
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={copy} className="btn-outline">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={send} className="btn-primary bg-success hover:bg-success/90" disabled={!mobile}>
            <MessageCircle className="w-4 h-4" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
