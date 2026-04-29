import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Upload, AlertTriangle, Plus, Trash2, Calendar, Loader2, Sparkles, Camera, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { generateDisplayId, auditLog, formatDate } from '@/lib/supabase-service';
import { toast } from 'sonner';
import WhatsAppTemplateModal from '@/components/WhatsAppTemplateModal';

const SERVICES = [
  { key: 'Air Ticket', emoji: '✈️' },
  { key: 'UAE Visa', emoji: '🪪', subcategories: ['Transit Visa', 'Outside Visa - Single Entry', 'Outside Visa - Multiple Entry', 'Visa Extension', 'Visa Change by Bus', 'Visa Change by Flight', 'Family Visa', 'Status Change', 'Visa Cancellation', 'Abscond'] },
  { key: 'Global Visa', emoji: '🌍', subcategories: ['Tourist', 'Business'], visaMode: true },
  { key: 'Holiday Package', emoji: '🏝️' },
  { key: 'Travel Insurance', emoji: '🛡️' },
  { key: 'Pilgrimage', emoji: '🕌' },
  { key: 'Meet & Assist', emoji: '🤝' },
  { key: 'Hotel Booking', emoji: '🏨' },
];

const LEAD_SOURCES = ['Walk-in', 'Call', 'WhatsApp', 'Social Media', 'Reference', 'Website', 'B2B Partner'];

// Unified master list — same suggestions appear for every service.
// Users can still add custom docs/dates with their own names.
const ALL_DOCS: string[] = [
  'Valid Passport (Bio Page)',
  'Passport (Back Page)',
  'UAE Residence Visa',
  'Emirates ID (Front)',
  'Emirates ID (Back)',
  'Passport-Size Photograph',
  '6-Month Bank Statement',
  'NOC Letter from Employer',
  'Salary Certificate',
  'Previous Travel History (Visas)',
  'Tenancy Contract / Property Proof',
  'Family Documents (Marriage/Birth)',
  'Trade License (for Corporate)',
  'Flight Ticket',
  'Hotel Confirmation',
  'Travel Insurance Certificate',
  'Vaccination Certificate',
  'Invitation Letter / Other Docs',
];

const ALL_DATES: string[] = [
  'Date of Birth',
  'Passport Expiry',
  'Visa Expiry',
  'Travel Date',
  'Wedding Anniversary',
  'Emirates ID Expiry',
  'Medical Report Expiry',
  'Contract End Date',
  'Insurance Expiry',
  'Trade License Expiry',
  'Visa Issue Date',
];

interface DocEntry { id: string; name: string; fileName: string; fileType: string; base64: string; uploadedAt: string; ocrExtracted?: boolean }
interface DateEntry { id: string; name: string; date: string }

const uid = () => Math.random().toString(36).slice(2, 10);

const buildWelcomeMessage = (name: string, service: string) =>
  `Dear ${name},\n\nThank you for choosing Nawi Saadi Travel & Tourism for your ${service || 'travel'} requirement. ✈️\n\nOur team has registered your enquiry and will be in touch shortly with the next steps.\n\nIf you have any questions, just reply to this message.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;

export default function AddClientWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editClientId = searchParams.get('edit');
  const { user, isAdmin } = useAuth();
  const [step, setStep] = useState(0);
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [editClient, setEditClient] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState<{ mobile: string; name: string; service: string } | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const basePath = isAdmin ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', serviceSubcategory: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as DocEntry[],
    importantDates: [] as DateEntry[],
  });

  // ---- Load existing client (edit mode only) ----
  useEffect(() => {
    if (!editClientId) return;
    supabase.from('clients').select('*').eq('id', editClientId).single().then(({ data }) => {
      if (!data) return;
      const legacyDates = (data.important_dates || {}) as Record<string, string>;
      const dateEntries: DateEntry[] = Array.isArray(legacyDates)
        ? legacyDates as any
        : Object.entries(legacyDates)
            .filter(([k, v]) => v && k !== 'passportNo')
            .map(([k, v]) => ({ id: uid(), name: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(), date: v }));

      const legacyDocs = (data.documents || []) as any[];
      const docEntries: DocEntry[] = legacyDocs.map((d: any) => ({
        id: uid(),
        name: d.name || d.docType || d.fileName || 'Document',
        fileName: d.fileName || d.name || 'file',
        fileType: d.fileType || d.type || 'application/octet-stream',
        base64: d.base64 || '',
        uploadedAt: d.uploadedAt || new Date().toISOString(),
        ocrExtracted: d.ocrExtracted,
      }));

      setEditClient(data);
      setIsEditMode(true);

      setForm(prev => ({
        ...prev,
        name: data.name, mobile: data.mobile, email: data.email || '',
        passportNo: data.passport_no || '',
        clientType: data.client_type || '',
        companyName: data.company_name || '',
        companyNumber: data.company_number || '',
        paymentType: data.payment_type || '',
        nationality: data.nationality || '',
        dob: legacyDates.dob || '',
        leadSource: data.lead_source || '',
        service: data.service || '',
        serviceSubcategory: data.service_subcategory || '',
        serviceDetails: (data.service_details as any) || {},
        importantDates: dateEntries,
        documents: docEntries,
      }));
      setStep(0);
    });
  }, [editClientId]);

  const updateForm = (changes: Partial<typeof form>) => setForm(prev => ({ ...prev, ...changes }));
  const updateSD = (key: string, val: string) => setForm(prev => ({ ...prev, serviceDetails: { ...prev.serviceDetails, [key]: val } }));

  // ---- Duplicate check ----
  useEffect(() => {
    if (isEditMode) return;
    if (!form.name && !form.mobile && !form.passportNo) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      const conditions: string[] = [];
      if (form.name.length >= 3) conditions.push(`name.ilike.%${form.name}%`);
      if (form.mobile.length >= 5) conditions.push(`mobile.eq.${form.mobile}`);
      if (conditions.length === 0) { setDuplicates([]); return; }
      const { data } = await supabase.from('clients').select('id, name, mobile, passport_no, display_id, service').or(conditions.join(','));
      setDuplicates(data || []);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.name, form.mobile, form.passportNo, isEditMode]);

  // ---- Document handling (custom name + multiple) with OCR auto-fill ----
  const handleAddDoc = (file: File, customName: string) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      const entry: DocEntry = {
        id: uid(),
        name: customName || file.name,
        fileName: file.name,
        fileType: file.type,
        base64: `NAWI_ENC::${base64Data}`,
        uploadedAt: new Date().toISOString(),
        ocrExtracted: false,
      };
      setForm(prev => ({ ...prev, documents: [...prev.documents, entry] }));

      if (file.type.startsWith('image/')) {
        setOcrLoading(entry.id);
        try {
          const { data, error } = await supabase.functions.invoke('extract-document', {
            body: { imageBase64: base64Data, docType: customName, service: form.service, serviceSubcategory: form.serviceSubcategory },
          });
          if (error) throw error;
          if (data?.success && data.data) {
            const extracted = data.data;
            const updates: any = {};
            if (extracted.fullName && !form.name) updates.name = extracted.fullName;
            if (extracted.passportNo && !form.passportNo) updates.passportNo = extracted.passportNo;
            if (extracted.nationality && !form.nationality) updates.nationality = extracted.nationality;
            if (extracted.phoneNumber && !form.mobile) updates.mobile = extracted.phoneNumber;
            if (extracted.email && !form.email) updates.email = extracted.email;
            if (extracted.dateOfBirth && !form.dob) updates.dob = extracted.dateOfBirth;

            const newDates: DateEntry[] = [];
            const pushDate = (name: string, val?: string) => {
              if (!val) return;
              const existing = form.importantDates.find(d => d.name.toLowerCase() === name.toLowerCase());
              if (!existing) newDates.push({ id: uid(), name, date: val });
            };
            pushDate('Date of Birth', extracted.dateOfBirth);
            pushDate('Passport Expiry', extracted.passportExpiry);
            pushDate('Passport Issue Date', extracted.passportIssueDate);
            pushDate('Visa Expiry', extracted.visaExpiry);
            pushDate('Emirates ID Expiry', (extracted.otherDetails as any)?.emiratesIdExpiry);

            const sdUpdates: any = { ...form.serviceDetails };
            if (extracted.gender) sdUpdates.gender = extracted.gender;
            if (extracted.profession) sdUpdates.profession = extracted.profession;
            if (extracted.placeOfBirth) sdUpdates.placeOfBirth = extracted.placeOfBirth;
            if (extracted.emiratesId) sdUpdates.emiratesId = extracted.emiratesId;
            if (extracted.sponsor) sdUpdates.sponsor = extracted.sponsor;
            if (extracted.visaType) sdUpdates.visaType = extracted.visaType;
            if (extracted.visaNumber) sdUpdates.visaNumber = extracted.visaNumber;

            setForm(prev => ({
              ...prev,
              ...updates,
              serviceDetails: sdUpdates,
              importantDates: [...prev.importantDates, ...newDates],
              documents: prev.documents.map(d => d.id === entry.id ? { ...d, ocrExtracted: true } : d),
            }));
            toast.success(`✨ AI extracted data from ${entry.name}`);
          }
        } catch (err) {
          console.error('OCR failed:', err);
          toast.error('Could not extract data. You can fill fields manually.');
        }
        setOcrLoading(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (id: string) => setForm(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== id) }));
  const renameDoc = (id: string, newName: string) => setForm(prev => ({ ...prev, documents: prev.documents.map(d => d.id === id ? { ...d, name: newName } : d) }));

  const addDate = (name = '', date = '') => setForm(prev => ({ ...prev, importantDates: [...prev.importantDates, { id: uid(), name, date }] }));
  const removeDate = (id: string) => setForm(prev => ({ ...prev, importantDates: prev.importantDates.filter(d => d.id !== id) }));
  const updateDate = (id: string, changes: Partial<DateEntry>) => setForm(prev => ({ ...prev, importantDates: prev.importantDates.map(d => d.id === id ? { ...d, ...changes } : d) }));

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);

    const datesObj: Record<string, string> = {};
    form.importantDates.forEach(d => {
      if (d.name && d.date) datesObj[d.name] = d.date;
    });
    if (form.dob) datesObj['Date of Birth'] = datesObj['Date of Birth'] || form.dob;

    try {
      if (isEditMode && editClient) {
        await supabase.from('clients').update({
          name: form.name, mobile: form.mobile, email: form.email || null,
          passport_no: form.passportNo || null, client_type: form.clientType || null,
          company_name: form.companyName || null, company_number: form.companyNumber || null,
          payment_type: form.paymentType || null, service: form.service,
          service_subcategory: form.serviceSubcategory || null, lead_source: form.leadSource || null,
          nationality: form.nationality || null, service_details: form.serviceDetails as any,
          documents: form.documents as any,
          important_dates: datesObj as any,
        }).eq('id', editClient.id);
        await auditLog('client_updated_via_wizard', 'client', editClient.id, { name: form.name });
        toast.success('Client updated');
        navigate(`${basePath}/clients/${editClient.id}`);
        return;
      }

      const displayId = await generateDisplayId('CLT');
      const svcDisplayId = await generateDisplayId('SVC');
      const { data: newClient, error } = await supabase.from('clients').insert({
        display_id: displayId, name: form.name, mobile: form.mobile, email: form.email || null,
        passport_no: form.passportNo || null, client_type: form.clientType || null,
        company_name: form.companyName || null, company_number: form.companyNumber || null,
        payment_type: form.paymentType || null, service: form.service,
        service_subcategory: form.serviceSubcategory || null, lead_source: form.leadSource || null,
        nationality: form.nationality || null, service_details: form.serviceDetails as any,
        documents: form.documents as any,
        important_dates: datesObj as any,
        family_members: [] as any,
        status: 'New' as const,
        assigned_to: user.id, created_by: user.id,
      }).select('id').single();

      if (error || !newClient) {
        toast.error(error?.message || 'Failed to create client');
        return;
      }

      await supabase.from('client_services').insert({
        display_id: svcDisplayId, client_id: newClient.id, service: form.service,
        service_subcategory: form.serviceSubcategory || null, service_details: form.serviceDetails as any,
        documents: form.documents as any,
        status: 'New' as const, request_month: selectedMonth, created_by: user.id,
      });
      await auditLog('client_created', 'client', newClient.id, { name: form.name, service: form.service, month: selectedMonth });
      toast.success('Client created');
      setCreatedClientId(newClient.id);
      setShowWelcome({ mobile: form.mobile, name: form.name, service: form.service });
    } finally {
      setSubmitting(false);
    }
  };

  const Field = ({ label, k, type = 'text', required = false }: { label: string; k: string; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label} {required && <span className="text-destructive">*</span>}</label>
      <input type={type} value={form.serviceDetails[k] || ''} onChange={(e) => updateSD(k, e.target.value)} className="input-nawi" />
    </div>
  );
  const SelectField = ({ label, k, options, allowOther = true }: { label: string; k: string; options: string[]; allowOther?: boolean }) => {
    const current = form.serviceDetails[k] || '';
    const isOther = current && !options.includes(current);
    const [mode, setMode] = useState<'preset' | 'other'>(isOther ? 'other' : 'preset');
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <select
          value={mode === 'other' ? '__other__' : current}
          onChange={(e) => {
            if (e.target.value === '__other__') { setMode('other'); updateSD(k, ''); }
            else { setMode('preset'); updateSD(k, e.target.value); }
          }}
          className="input-nawi"
        >
          <option value="">Select</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          {allowOther && <option value="__other__">Others (specify)</option>}
        </select>
        {mode === 'other' && (
          <input
            autoFocus
            value={current}
            onChange={(e) => updateSD(k, e.target.value)}
            placeholder={`Enter custom ${label.toLowerCase()}`}
            className="input-nawi mt-2"
          />
        )}
      </div>
    );
  };

  const selectedServiceObj = SERVICES.find(s => s.key === form.service);
  const hasSubcategories = selectedServiceObj && 'subcategories' in selectedServiceObj;

  const steps = ['Type & Service', 'Documents (AI Scan)', 'Client Details', 'Review'];

  const canProceedStep0 = form.clientType && form.leadSource && form.leadSource.trim() && form.service && (!hasSubcategories || form.serviceSubcategory);
  const canProceedStep2 = form.name && form.mobile;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {isEditMode && editClient && (
        <div className="card-nawi bg-secondary/5 border-secondary/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold">{editClient.name?.charAt(0)}</div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Editing: {editClient.name}</p>
              <p className="text-xs text-muted-foreground">{editClient.display_id} • {editClient.mobile}</p>
            </div>
            <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded-full font-medium">EDIT MODE</span>
          </div>
        </div>
      )}

      <div className="card-nawi flex items-center gap-4 bg-primary/5 border-primary/20">
        <Calendar className="w-5 h-5 text-primary" />
        <div>
          <label className="block text-xs text-muted-foreground">Request Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input-nawi w-auto text-sm mt-0.5" />
        </div>
        <p className="text-xs text-muted-foreground flex-1">All service requests are tracked by month for reporting.</p>
      </div>

      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
      </div>

      {duplicates.length > 0 && step >= 2 && !isEditMode && (
        <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">⚠️ Possible Duplicate</span></div>
          {duplicates.slice(0, 3).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-2 bg-card rounded-lg border border-border mb-1">
              <div>
                <span className="text-sm font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.mobile} • {d.display_id}</span>
              </div>
              <button onClick={() => navigate(`${basePath}/clients/${d.id}`)} className="btn-outline text-xs">View</button>
            </div>
          ))}
        </div>
      )}

      <div className="card-nawi">
        {/* ===== STEP 0: TYPE & SERVICE ===== */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">1. Client Type</h2>
            <div className="grid grid-cols-3 gap-3">
              {[{ key: 'Individual', icon: '👤', desc: 'Single person' }, { key: 'B2B', icon: '🏢', desc: 'Business partner' }, { key: 'Corporate', icon: '🏗️', desc: 'Company/Group' }].map(({ key, icon, desc }) => (
                <button key={key} onClick={() => updateForm({ clientType: key })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.clientType === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-2xl block mb-1">{icon}</span><span className="text-sm font-medium">{key}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
            {(form.clientType === 'B2B' || form.clientType === 'Corporate') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                <div><label className="block text-sm font-medium mb-1">Company Name *</label><input value={form.companyName} onChange={(e) => updateForm({ companyName: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Company Reg. No.</label><input value={form.companyNumber} onChange={(e) => updateForm({ companyNumber: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Payment Type</label>
                  <div className="flex gap-3 mt-1">{['Cash', 'Credit'].map(t => <label key={t} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="paymentType" value={t} checked={form.paymentType === t} onChange={(e) => updateForm({ paymentType: e.target.value })} className="w-4 h-4" /><span className="text-sm">{t}</span></label>)}</div>
                </div>
              </div>
            )}
            <h2 className="text-lg font-bold font-display pt-4">2. Lead Source</h2>
            <div className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map(s => (
                <button key={s} onClick={() => updateForm({ leadSource: s })} className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${form.leadSource === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-secondary'}`}>{s}</button>
              ))}
              {(() => {
                const isOther = form.leadSource && !LEAD_SOURCES.includes(form.leadSource);
                return (
                  <button onClick={() => updateForm({ leadSource: isOther ? form.leadSource : ' ' })} className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${isOther ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-secondary'}`}>
                    Others
                  </button>
                );
              })()}
            </div>
            {form.leadSource && !LEAD_SOURCES.includes(form.leadSource) && (
              <input
                autoFocus
                value={form.leadSource.trim()}
                onChange={(e) => updateForm({ leadSource: e.target.value || ' ' })}
                placeholder="Enter custom lead source"
                className="input-nawi mt-2 max-w-sm"
              />
            )}

            <h2 className="text-lg font-bold font-display pt-4">3. Select Service</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SERVICES.map(({ key, emoji }) => (
                <button key={key} onClick={() => updateForm({ service: key, serviceSubcategory: '', serviceDetails: {} })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.service === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-2xl block mb-2">{emoji}</span><span className="text-sm font-medium">{key}</span>
                </button>
              ))}
            </div>

            {hasSubcategories && form.service && (
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3">{form.service} — Select Type</h3>
                <div className="flex flex-wrap gap-2">
                  {(selectedServiceObj as any).subcategories.map((sub: string) => (
                    <button key={sub} onClick={() => updateForm({ serviceSubcategory: sub })}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.serviceSubcategory === sub ? 'bg-secondary text-secondary-foreground border-secondary' : 'border-border hover:border-secondary'}`}>
                      {sub}
                    </button>
                  ))}
                </div>
                {form.service === 'Global Visa' && form.serviceSubcategory && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold mb-3">Visa Processing Mode</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'eVisa', icon: '💻', title: 'eVisa', desc: 'Online application — processed digitally' },
                        { key: 'Sticker Visa', icon: '🏛️', title: 'Sticker Visa', desc: 'Direct embassy submission — physical stamp' },
                      ].map(({ key, icon, title, desc }) => (
                        <button key={key} onClick={() => updateSD('visaMode', key)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${form.serviceDetails.visaMode === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                          <span className="text-xl">{icon}</span>
                          <p className="text-sm font-medium mt-1">{title}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 1: DOCUMENTS UPLOAD + AI OCR ===== */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold font-display">📸 Upload Documents — AI will auto-fill</h2>
              <p className="text-sm text-muted-foreground mt-1">Take a photo or upload passport, Emirates ID, visa, etc. AI extracts name, passport, dates and pre-fills the next step. Scan multiple documents.</p>
            </div>

            <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-primary">How it works</p>
                <p className="text-muted-foreground">Name the doc (e.g. "Passport"), then upload from device or use camera. AI auto-fills personal info & dates. You can skip and fill manually.</p>
              </div>
            </div>

            <DocumentsSection
              docs={form.documents}
              suggestions={ALL_DOCS}
              onAdd={handleAddDoc}
              onRemove={removeDoc}
              onRename={renameDoc}
              ocrLoadingId={ocrLoading}
            />
          </div>
        )}

        {/* ===== STEP 2: CLIENT DETAILS + SERVICE FIELDS + DATES ===== */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">
              Client Information — {form.service}{form.serviceSubcategory ? ` (${form.serviceSubcategory})` : ''}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Full Name <span className="text-destructive">*</span></label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Mobile <span className="text-destructive">*</span></label><input value={form.mobile} onChange={(e) => updateForm({ mobile: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => updateForm({ email: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Nationality</label><input value={form.nationality} onChange={(e) => updateForm({ nationality: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Date of Birth</label><input type="date" value={form.dob} onChange={(e) => updateForm({ dob: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Passport Number</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi" /></div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-base font-semibold font-display mb-4">{form.service} Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.service === 'Air Ticket' && <><Field label="Travel Date" k="travelDate" type="date" required /><Field label="Departure City" k="departureCity" required /><Field label="Arrival City" k="arrivalCity" required /><Field label="Flight Number" k="flightNumber" /><Field label="PNR" k="pnr" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Class" k="travelClass" options={['Economy', 'Premium Economy', 'Business', 'First Class']} /></>}
                {form.service === 'UAE Visa' && <UAEVisaFields sub={form.serviceSubcategory} Field={Field} SelectField={SelectField} form={form} />}
                {form.service === 'Global Visa' && <><Field label="Country" k="country" required /><SelectField label="Applicant Type" k="applicantType" options={['Employed', 'Self-Employed', 'Unemployed', 'Retired']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" />{form.serviceDetails.visaMode === 'eVisa' && <><Field label="Online Portal Reference" k="eVisaRef" /><Field label="Application URL" k="applicationUrl" /></>}{form.serviceDetails.visaMode === 'Sticker Visa' && <><Field label="Embassy Name" k="embassyName" /><Field label="Appointment Date" k="appointmentDate" type="date" /></>}</>}
                {form.service === 'Holiday Package' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Adults" k="adults" /><Field label="Children" k="children" /><Field label="Destination" k="destination" /></>}
                {form.service === 'Travel Insurance' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Coverage Type" k="coverageType" options={['Individual', 'Family', 'Group', 'Annual Multi-Trip']} /><Field label="Destination" k="destination" /></>}
                {form.service === 'Pilgrimage' && <><SelectField label="Type" k="pilgrimageType" options={['Hajj', 'Umrah']} /><Field label="Season/Year" k="season" /><Field label="Group Name" k="groupName" /><Field label="No. of Persons" k="persons" /></>}
                {form.service === 'Meet & Assist' && <><Field label="Flight Number" k="flightNumber" /><SelectField label="Type" k="maType" options={['Arrival', 'Departure', 'Transit']} /><Field label="Airport" k="airport" /><Field label="Date/Time" k="dateTime" type="datetime-local" /></>}
                {form.service === 'Hotel Booking' && <><Field label="Check-in" k="checkinDate" type="date" /><Field label="Check-out" k="checkoutDate" type="date" /><Field label="City" k="city" /><Field label="Rooms" k="rooms" /><SelectField label="Room Type" k="roomType" options={['Standard', 'Deluxe', 'Suite', 'Villa']} /></>}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <DatesSection
                dates={form.importantDates}
                suggestions={ALL_DATES}
                onAdd={addDate}
                onRemove={removeDate}
                onUpdate={updateDate}
              />
            </div>
          </div>
        )}

        {/* ===== STEP 3: REVIEW ===== */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Review & {isEditMode ? 'Save' : 'Submit'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client</h3>
                <div className="space-y-1">
                  {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Nationality', form.nationality], ['Client Type', form.clientType], ['Lead Source', form.leadSource], ['Request Month', selectedMonth]].map(([l, v]) => v && (
                    <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Service</h3>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service</span><span className="font-medium">{form.service}</span></div>
                  {form.serviceSubcategory && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Type</span><span className="font-medium">{form.serviceSubcategory}</span></div>}
                  {Object.entries(form.serviceDetails).filter(([_, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm"><span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
            {form.importantDates.filter(d => d.name && d.date).length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">📅 Important Dates ({form.importantDates.filter(d => d.name && d.date).length})</h3>
                <div className="flex flex-wrap gap-2">
                  {form.importantDates.filter(d => d.name && d.date).map((d) => (
                    <span key={d.id} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{d.name}: {formatDate(d.date)}</span>
                  ))}
                </div>
              </div>
            )}
            {form.documents.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">📎 Documents ({form.documents.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {form.documents.map(d => (
                    <span key={d.id} className="text-xs bg-success/10 text-success px-2 py-1 rounded-full flex items-center gap-1"><Check className="w-3 h-3" />{d.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-6 border-t border-border">
          <button onClick={() => step > 0 ? setStep(step - 1) : navigate(`${basePath}/clients`)} className="btn-outline" disabled={submitting}>
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 0 ? !canProceedStep0 : step === 2 ? !canProceedStep2 : false}
              className="btn-primary disabled:opacity-50">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isEditMode ? 'Save Changes' : 'Create Client'}
            </button>
          )}
        </div>
      </div>

      {showWelcome && createdClientId && (
        <WhatsAppTemplateModal
          open={true}
          onClose={() => { setShowWelcome(null); navigate(`${basePath}/clients/${createdClientId}`); }}
          mobile={showWelcome.mobile}
          defaultMessage={buildWelcomeMessage(showWelcome.name, showWelcome.service)}
          title="Send Welcome Message"
        />
      )}
    </div>
  );
}

// ============== Documents Section ==============
function DocumentsSection({
  docs, suggestions, onAdd, onRemove, onRename, ocrLoadingId,
}: {
  docs: DocEntry[]; suggestions: string[];
  onAdd: (file: File, name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  ocrLoadingId: string | null;
}) {
  const [pendingName, setPendingName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const triggerUpload = (camera: boolean) => {
    if (!pendingName.trim()) {
      toast.error('Enter a document name first');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    if (camera) input.setAttribute('capture', 'environment');
    input.multiple = true;
    input.onchange = (e: any) => {
      const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
      files.forEach((file, i) => {
        onAdd(file, files.length > 1 ? `${pendingName} (${i + 1})` : pendingName);
      });
      setPendingName('');
    };
    input.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold font-display">📎 Documents</h3>
        <span className="text-xs text-muted-foreground">{docs.length} uploaded</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Add any number of documents. Give each one a clear name. 📸 AI auto-extracts details from images.</p>

      <div className="card-nawi bg-muted/30 space-y-3">
        <label className="block text-sm font-medium">Add Document</label>
        <div className="relative">
          <input
            type="text"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Document name (e.g. Passport, Emirates ID, Visa Copy...)"
            className="input-nawi"
          />
          {showSuggestions && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-elevated max-h-48 overflow-y-auto">
              {suggestions.filter(s => !pendingName || s.toLowerCase().includes(pendingName.toLowerCase())).map(s => (
                <button key={s} type="button" onMouseDown={() => { setPendingName(s); setShowSuggestions(false); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-muted">{s}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => triggerUpload(false)} className="btn-outline flex-1"><Upload className="w-4 h-4" /> Upload File(s)</button>
          <button type="button" onClick={() => triggerUpload(true)} className="btn-outline flex-1"><Camera className="w-4 h-4" /> Take Photo</button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {docs.map(d => {
            const base64Src = d.base64?.startsWith('NAWI_ENC::') ? d.base64.replace('NAWI_ENC::', '') : d.base64;
            const isImage = d.fileType?.startsWith('image/');
            const loading = ocrLoadingId === d.id;
            return (
              <div key={d.id} className="border border-border rounded-lg overflow-hidden bg-card">
                {isImage && base64Src ? (
                  <a href={base64Src} target="_blank" rel="noopener noreferrer">
                    <img src={base64Src} alt={d.name} className="w-full h-32 object-cover hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center">
                    <FileText className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2 space-y-1">
                  <input
                    value={d.name}
                    onChange={(e) => onRename(d.id, e.target.value)}
                    className="input-nawi text-xs py-1 font-medium"
                  />
                  <p className="text-[10px] text-muted-foreground truncate">{d.fileName}</p>
                  {loading && <p className="text-xs text-primary flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> AI scanning...</p>}
                  {d.ocrExtracted && !loading && <p className="text-xs text-success flex items-center gap-1"><Sparkles className="w-3 h-3" /> Auto-filled</p>}
                  <button onClick={() => onRemove(d.id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============== Dates Section ==============
function DatesSection({
  dates, suggestions, onAdd, onRemove, onUpdate,
}: {
  dates: DateEntry[]; suggestions: string[];
  onAdd: (name?: string, date?: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, changes: Partial<DateEntry>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold font-display">📅 Important Dates</h3>
        <span className="text-xs text-muted-foreground">{dates.length} added</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Add any number of dates with custom names. The system will send reminders 3, 2, 1 day before.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {suggestions.filter(s => !dates.some(d => d.name === s)).map(s => (
          <button key={s} type="button" onClick={() => onAdd(s, '')} className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:bg-primary/5 transition-colors">
            <Plus className="w-3 h-3 inline mr-1" />{s}
          </button>
        ))}
        <button type="button" onClick={() => onAdd('', '')} className="text-xs px-3 py-1.5 rounded-full border border-secondary text-secondary hover:bg-secondary/5">
          <Plus className="w-3 h-3 inline mr-1" />Custom date
        </button>
      </div>

      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">No dates added yet — click a suggestion above</p>
      ) : (
        <div className="space-y-2">
          {dates.map((d) => (
            <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={d.name}
                onChange={(e) => onUpdate(d.id, { name: e.target.value })}
                placeholder="Date name (e.g. Travel Date)"
                className="input-nawi col-span-6"
              />
              <input
                type="date"
                value={d.date}
                onChange={(e) => onUpdate(d.id, { date: e.target.value })}
                className="input-nawi col-span-5"
              />
              <button onClick={() => onRemove(d.id)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg col-span-1 flex justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============= UAE Visa subcategory-specific fields =============
function UAEVisaFields({ sub, Field, SelectField, form }: { sub: string; Field: any; SelectField: any; form: any }) {
  const Hint = ({ items }: { items: string[] }) => (
    <div className="md:col-span-2 mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <p className="text-xs font-semibold text-primary mb-1">📋 Required Documents</p>
      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
  const Note = ({ text }: { text: string }) => (
    <div className="md:col-span-2 p-2 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning-foreground">
      ⏱ {text}
    </div>
  );

  switch (sub) {
    case 'Transit Visa':
      return (
        <>
          <SelectField label="Transit Duration" k="transitDuration" options={['48 Hours', '96 Hours']} />
          <Field label="Onward Destination" k="onwardDestination" />
          <Field label="Third Country Visa" k="thirdCountryVisa" />
          <Field label="Hotel Booking Ref" k="hotelBookingRef" />
          <Field label="Onward Ticket Ref" k="onwardTicketRef" />
          <Field label="Nationality" k="nationality" />
          <Note text="Validity: 2/4 days from entry. Must be used within 14 days of issuance." />
          <Hint items={[
            'Passport copy — front & back (valid 6+ months)',
            'One photograph',
            'Third country visa copy',
            'Confirmed onward ticket to third destination',
            'Confirmed hotel booking',
          ]} />
        </>
      );
    case 'Outside Visa - Single Entry':
      return (
        <>
          <SelectField label="Visa Duration" k="visaDuration" options={['30 Days', '60 Days']} />
          <Field label="Nationality" k="nationality" />
          <Field label="Travel Date" k="travelDate" type="date" />
          <Field label="Hotel Booking Ref" k="hotelBookingRef" />
          <Field label="Ticket Reference" k="ticketReference" />
          <Note text="Visa must be used within 60 days of issuance." />
          <Hint items={[
            'Passport copy — front & back (valid 6+ months)',
            'Passport cover page',
            'One photograph',
            'Confirmed ticket copy',
            'Confirmed hotel booking',
            'Bank statement (for certain nationalities)',
          ]} />
        </>
      );
    case 'Outside Visa - Multiple Entry':
      return (
        <>
          <SelectField label="Visa Duration" k="visaDuration" options={['30 Days', '60 Days']} />
          <Field label="Nationality" k="nationality" />
          <Field label="Travel Date" k="travelDate" type="date" />
          <Field label="Hotel Booking Ref" k="hotelBookingRef" />
          <Field label="Ticket Reference" k="ticketReference" />
          <Note text="Multiple entries allowed. Must be used within 60 days of issuance." />
          <Hint items={[
            'Passport copy — front & back (valid 6+ months)',
            'Passport cover page',
            'One photograph',
            'Confirmed ticket copy',
            'Confirmed hotel booking',
          ]} />
        </>
      );
    case 'Visa Extension':
      return (
        <>
          <SelectField label="Original Visa Duration" k="originalVisaDuration" options={['30 Days', '60 Days']} />
          <SelectField label="Extension Number" k="extensionNumber" options={['1st Extension', '2nd Extension', '3rd Extension']} />
          <Field label="Current Visa Number" k="currentVisaNumber" />
          <Field label="Current Visa Expiry" k="currentVisaExpiry" type="date" />
          <Note text="Inside-country extension for next 30 days. 30-day visa: up to 3 extensions. 60-day visa: up to 2 extensions. Only for visas we issued." />
        </>
      );
    case 'Visa Change by Bus':
      return (
        <>
          <SelectField label="Bus Service Type" k="busServiceType" options={['Visit Visa Renewal', 'Residence Cancellation']} />
          <SelectField label="Pickup Emirate" k="pickupEmirate" options={['Dubai - Near Dnata', 'Sharjah - Safari Mall', 'Abu Dhabi - Mussaffa Safeer Center', 'Abu Dhabi - Madinat Zayed']} />
          <Field label="Travel Date" k="travelDate" type="date" />
          <Field label="Guarantor Name" k="guarantorName" />
          <Field label="Guarantor Emirates ID" k="guarantorEid" />
          <Note text="Inclusion: 60-day visa (Sharjah/Dubai) without deposit, 10-day Oman visa, round trip ticket, 1-day accommodation, exit voucher, 3 meals. Same-day return possible if visa approved before 4 PM." />
          <Hint items={
            form.serviceDetails.busServiceType === 'Residence Cancellation'
              ? [
                  'Passport copy — front & back',
                  'Passport cover page',
                  'Cancellation paper',
                  'Original Emirates ID',
                  'One white-background photograph',
                  'Guarantor Emirates ID',
                ]
              : [
                  'Passport copy — front & back',
                  'Passport cover page',
                  'Current visit visa copy',
                  'One white-background photograph',
                  'Guarantor Emirates ID',
                ]
          } />
        </>
      );
    case 'Visa Change by Flight':
      return (
        <>
          <SelectField label="Airline" k="airline" options={['Fly Dubai', 'Al Jazeera Airways', 'Air Arabia']} />
          <Field label="Travel Date" k="travelDate" type="date" />
          <Field label="Guarantor Name" k="guarantorName" />
          <Field label="Guarantor Emirates ID" k="guarantorEid" />
          <Note text="Inclusion: 60-day Dubai visa without deposit + 10-day Oman visa. Same-day return; passenger waits at airport until visa approved. Fly Dubai: overstay/outpass cases not allowed; must be first A2A." />
          <Hint items={[
            'Passport copy — front & back',
            'Passport cover page',
            'Current visit visa copy or cancellation paper',
            'One white-background photograph',
            'Guarantor Emirates ID',
          ]} />
        </>
      );
    case 'Family Visa':
      return (
        <>
          <Field label="Sponsor Name" k="sponsorName" required />
          <Field label="Sponsor UID" k="sponsorUid" />
          <Field label="Sponsor Salary" k="sponsorSalary" />
          <Field label="Relationship" k="relationship" />
          <Field label="Nationality" k="nationality" />
        </>
      );
    case 'Abscond':
      return (
        <>
          <Field label="Last Known Location" k="lastLocation" />
          <Field label="Abscond Date" k="abscondDate" type="date" />
          <Field label="Case Reference" k="caseReference" />
        </>
      );
    case 'Status Change':
    case 'Visa Cancellation':
    default:
      return (
        <>
          <SelectField label="Application Type" k="applicationType" options={['Inside UAE', 'Outside UAE']} />
          <Field label="Current Visa Number" k="currentVisaNumber" />
          <Field label="Nationality" k="nationality" />
        </>
      );
  }
}
