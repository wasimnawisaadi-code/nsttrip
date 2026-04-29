// Shared helpers for branded PDFs (logo + header).
import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo.png';

let cachedLogo: string | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return cachedLogo;
  } catch {
    return null;
  }
}

/** Draw the Nawi Saadi branded header on a jsPDF doc. Returns y of header bottom. */
export async function drawBrandHeader(doc: jsPDF, title: string): Promise<number> {
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      // Preserve logo aspect ratio (source ~1279x874 → ratio ~1.46)
      const props: any = (doc as any).getImageProperties ? (doc as any).getImageProperties(logo) : { width: 1279, height: 874 };
      const targetH = 20;
      const targetW = (props.width / props.height) * targetH;
      doc.addImage(logo, 'PNG', 18, 10, targetW, targetH, undefined, 'FAST');
    } catch (e) { console.warn('Logo render failed', e); }
  }
  doc.setFontSize(16);
  doc.setTextColor(5, 47, 89); // navy
  doc.text('NAWI SAADI TRAVEL & TOURISM', 60, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Travel & Tourism Services', 60, 28);
  doc.setDrawColor(5, 47, 89);
  doc.setLineWidth(0.4);
  doc.line(18, 38, 192, 38);
  doc.setFontSize(13);
  doc.setTextColor(5, 47, 89);
  doc.text(title.toUpperCase(), 18, 48);
  doc.setTextColor(0);
  return 52;
}

export async function drawBrandFooter(doc: jsPDF, authorizedBy?: string) {
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(18, ph - 22, 192, ph - 22);
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (authorizedBy) doc.text(`Authorized by: ${authorizedBy}`, 18, ph - 16);
  doc.text('Nawi Saadi Travel & Tourism', 18, ph - 11);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, 192, ph - 11, { align: 'right' });
}
