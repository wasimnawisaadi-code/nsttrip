// Document OCR — uses Google Service Account (GOOGLE_CLOUD_SA_JSON) for Vision + Gemini
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripBase64Prefix(b64: string): string {
  const idx = b64.indexOf(",");
  return idx >= 0 ? b64.slice(idx + 1) : b64;
}

function normalizeDate(value: string): string | null {
  const cleaned = value.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const numericMatch = cleaned.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    const year = Number(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3]);
    if (day && month && year) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  return null;
}

function extractByLabel(rawText: string, labels: string[]): string | null {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(?:${escaped.join("|")})\\s*[:\-]?\\s*([^\n]{2,80})`, "i");
  const match = rawText.match(regex);
  return match?.[1]?.replace(/^[^A-Z0-9+]+/i, '').trim() || null;
}

function extractByPattern(rawText: string, pattern: RegExp): string | null {
  const match = rawText.match(pattern);
  return match?.[1]?.trim() || null;
}

function heuristicExtract(rawText: string): Record<string, unknown> {
  const isEmiratesId = /united arab emirates|identity card|emirates id/i.test(rawText);
  const isVisa = /visa|entry permit/i.test(rawText);
  const isPassport = /passport/i.test(rawText);

  let documentType = 'other';
  if (isEmiratesId) documentType = 'emirates_id';
  else if (isVisa) documentType = 'visa';
  else if (isPassport) documentType = 'passport';

  const fullName = extractByLabel(rawText, ["Name", "Surname", "Full Name", "Given Name"]) ||
    extractByPattern(rawText, /(?:name|surname)\s*[:\-]?\s*([A-Z][A-Z\s]{3,60})/i);
  const nationality = extractByLabel(rawText, ["Nationality"]) ||
    extractByPattern(rawText, /nationality\s*[:\-]?\s*([A-Za-z ]{3,40})/i);
  const dateOfBirth = normalizeDate(
    extractByLabel(rawText, ["Date of Birth", "Birth Date", "DOB"]) ||
    extractByPattern(rawText, /(?:date of birth|birth date|dob)\s*[:\-]?\s*([^\n]{4,20})/i) ||
    ""
  );
  const gender = extractByLabel(rawText, ["Sex", "Gender"]);
  const phoneNumber = extractByPattern(rawText, /(\+?\d[\d\s\-]{7,20}\d)/);
  const email = extractByPattern(rawText, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);

  let passportNo = null, passportExpiry = null, passportIssueDate = null;
  let emiratesId = null, emiratesIdExpiry = null, emiratesIdIssueDate = null;
  let visaNumber = null, visaExpiry = null, visaType = null;

  if (documentType === 'emirates_id') {
    emiratesId = extractByLabel(rawText, ["ID Number", "Emirates ID", "Identity Number"]) ||
      extractByPattern(rawText, /(?:784-\d{4}-\d{7}-\d|\d{3}-\d{4}-\d{7}-\d)/i);
    emiratesIdExpiry = normalizeDate(extractByLabel(rawText, ["Expiry Date", "Date of Expiry", "Valid Until"]) || "");
    emiratesIdIssueDate = normalizeDate(extractByLabel(rawText, ["Issue Date", "Date of Issue", "Issuing Date"]) || "");
  } else if (documentType === 'visa') {
    visaNumber = extractByLabel(rawText, ["Visa No", "Visa Number", "Permit No"]);
    visaExpiry = normalizeDate(extractByLabel(rawText, ["Visa Expiry", "Visa Expiration", "Valid Until", "Date of Expiry"]) || "");
    visaType = extractByLabel(rawText, ["Visa Type"]);
  } else {
    passportNo = extractByLabel(rawText, ["Passport No", "Passport Number", "Document No"]) ||
      extractByPattern(rawText, /passport(?:\s+no|\s+number)?\s*[:\-]?\s*([A-Z0-9]{6,12})/i);
    passportExpiry = normalizeDate(
      extractByLabel(rawText, ["Date of Expiry", "Expiry Date", "Passport Expiry"]) ||
      extractByPattern(rawText, /(?:date of expiry|expiry date|passport expiry)\s*[:\-]?\s*([^\n]{4,20})/i) ||
      ""
    );
    passportIssueDate = normalizeDate(
      extractByLabel(rawText, ["Date of Issue", "Issue Date", "Passport Issue Date"]) ||
      extractByPattern(rawText, /(?:date of issue|issue date|passport issue date)\s*[:\-]?\s*([^\n]{4,20})/i) ||
      ""
    );
  }

  return {
    documentType,
    fullName: fullName || null,
    passportNo,
    nationality: nationality || null,
    dateOfBirth,
    passportExpiry,
    passportIssueDate,
    placeOfBirth: extractByLabel(rawText, ["Place of Birth"]) || null,
    gender: gender || null,
    emiratesId,
    emiratesIdExpiry,
    emiratesIdIssueDate,
    visaNumber,
    visaExpiry,
    visaType,
    sponsor: extractByLabel(rawText, ["Sponsor"]) || null,
    profession: extractByLabel(rawText, ["Profession", "Occupation"]) || null,
    address: extractByLabel(rawText, ["Address"]) || null,
    phoneNumber: phoneNumber || null,
    email: email || null,
    bloodGroup: extractByLabel(rawText, ["Blood Group", "Blood Type"]) || null,
    maritalStatus: extractByLabel(rawText, ["Marital Status"]) || null,
    fatherName: extractByLabel(rawText, ["Father Name", "Father's Name"]) || null,
    motherName: extractByLabel(rawText, ["Mother Name", "Mother's Name"]) || null,
    issuingAuthority: extractByLabel(rawText, ["Authority", "Issuing Authority", "Place of Issue"]) || null,
    documentNumber: extractByLabel(rawText, ["Document No", "Document Number"]) || passportNo || null,
    otherDetails: {
      rawTextMatch: true
    }
  };
}

// ============ Service Account → OAuth Access Token ============
let cachedToken: { token: string; exp: number } | null = null;

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = new TextEncoder().encode(data);
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = data;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const saJson = Deno.env.get('GOOGLE_CLOUD_SA_JSON');
  if (!saJson) throw new Error('GOOGLE_CLOUD_SA_JSON not configured');
  const sa = JSON.parse(saJson);

  if (cachedToken && cachedToken.exp > Date.now() + 60_000) {
    return { token: cachedToken.token, projectId: sa.project_id };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed: ${await tokRes.text()}`);
  const tok = await tokRes.json();
  cachedToken = { token: tok.access_token, exp: Date.now() + (tok.expires_in * 1000) };
  return { token: tok.access_token, projectId: sa.project_id };
}
// ============ End helper ============

async function callGeminiVisionStructured(prompt: string, imageB64: string, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

  // Try multiple models — fall through on 503/500/404
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  let lastErr = '';
  for (const m of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageB64 } },
          ],
        }],
        generationConfig: { temperature: 0.05, responseMimeType: 'application/json' },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
    if (![404, 500, 503].includes(res.status)) break;
  }
  throw new Error(`Gemini vision failed: ${lastErr}`);
}

async function structureWithApiKey(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  let lastErr = '';
  for (const m of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
    if (![404, 500, 503].includes(res.status)) break;
  }
  throw new Error(`Gemini text failed: ${lastErr}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, docType, service, serviceSubcategory } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image/document provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanB64 = stripBase64Prefix(imageBase64);
    const mime = imageBase64.startsWith('data:')
      ? imageBase64.slice(5, imageBase64.indexOf(';'))
      : 'image/jpeg';

    const isImage = mime.startsWith('image/');
    let rawText = "";

    // Step 1: Only use Vision API for Images
    if (isImage) {
      try {
        const { token, projectId } = await getAccessToken();
        const visionRes = await fetch("https://vision.googleapis.com/v1/images:annotate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "x-goog-user-project": projectId,
          },
          body: JSON.stringify({
            requests: [{
              image: { content: cleanB64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            }],
          }),
        });

        if (visionRes.ok) {
          const visionJson = await visionRes.json();
          rawText = visionJson.responses?.[0]?.fullTextAnnotation?.text || "";
        }
      } catch (err) {
        console.warn("Vision API fallback failed:", err);
      }
    }

    // Step 2: Use Gemini (Vision or Document aware)
    const prompt = `You are an expert document data extractor for Nawi Saadi Travel & Tourism (UAE).
Document type hint: ${docType || "unknown"}. Service context: ${service || "unknown"}${serviceSubcategory ? ` (${serviceSubcategory})` : ""}.

Analyze the provided ${isImage ? 'image' : 'document'} and extract structured data with 100% precision.
${rawText ? `OCR Suggestion: """\n${rawText}\n"""\nUse the OCR as a hint but the document visual/content is final.` : ''}

EXTRACT THESE FIELDS (use null if not found):
- fullName, firstName, lastName
- nationality, gender (Male/Female)
- dateOfBirth (YYYY-MM-DD): CRITICAL for Emirates ID. Look for "Date of Birth" or "Birth Date".
- passportNo, passportExpiry (YYYY-MM-DD), passportIssueDate (YYYY-MM-DD)
- emiratesId (Format: 784-XXXX-XXXXXXX-X), emiratesIdExpiry, emiratesIdIssueDate
- visaNumber, visaExpiry, visaIssueDate, visaType
- profession, sponsor, address, phoneNumber, email

DYNAMIC ARRAYS:
1. "extractedDates": [{ "name": "Name", "date": "YYYY-MM-DD" }]
   - STRICT RULE: Do NOT include Date of Birth here. Only include additional dates like "Unified No Expiry", "Insurance Expiry", etc.
   - Do NOT repeat dates already captured in top-level fields (like visaExpiry).
2. "extractedFields": [{ "key": "Name", "value": "Value" }]

CRITICAL FOR EMIRATES ID:
- Date of Birth is usually on the FRONT.
- Expiry Date is always present.
- Format the ID as 784-XXXX-XXXXXXX-X.

Return ONLY a strict JSON object. No markdown.`;

    let text = "{}";
    try {
      text = await callGeminiVisionStructured(prompt, cleanB64, mime);
    } catch (visionErr) {
      console.error('Gemini extraction failed:', visionErr);
      if (rawText) {
        return new Response(JSON.stringify({
          success: true,
          data: heuristicExtract(rawText),
          warning: "AI extraction failed — used regex fallback.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw visionErr;
    }

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { extracted = JSON.parse(match[0]); } catch { extracted = { otherDetails: { rawText } }; }
      } else {
        extracted = { otherDetails: { rawText } };
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
