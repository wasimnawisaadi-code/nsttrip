// Nationality values in the CRM are typed by hand, so the same country arrives
// in many shapes: "Turkmenistan" / "turkemistan" / "TURKMENISTAN",
// "India" / "INDIAN", "Afghanistan" / "AFG" / "Afghani".
// canonicalNationality() folds all of those onto one display label so filtering
// by a country actually returns every matching person.

// Canonical label -> the variants/roots that should map onto it.
// Roots are matched as prefixes after normalisation, which covers the common
// "-i"/"-n"/"-ese" demonyms (Pakistan/Pakistani, India/Indian) and truncated
// codes (AFG) without needing every spelling listed.
const COUNTRY_ROOTS: Array<[string, string[]]> = [
  ['Afghanistan', ['afg', 'afghan', 'afghani', 'afghanistan']],
  ['Turkmenistan', ['turkm', 'turkem', 'turkmen', 'turkemistan', 'turkmenistan', 'tkm']],
  ['India', ['ind', 'indi', 'indian', 'india']],
  ['Pakistan', ['pak', 'pakistan', 'pakistani', 'pk']],
  ['Bangladesh', ['ban', 'bang', 'bangla', 'bangladesh', 'bangladeshi', 'bd']],
  ['Nepal', ['nep', 'nepal', 'nepali', 'nepalese', 'npl']],
  ['Sri Lanka', ['sri', 'srilanka', 'srilankan', 'lanka', 'lka']],
  ['Philippines', ['phi', 'phil', 'philippines', 'filipino', 'filipina', 'pinoy', 'phl']],
  ['Egypt', ['egy', 'egypt', 'egyptian']],
  ['Jordan', ['jor', 'jordan', 'jordanian']],
  ['Iraq', ['irq', 'iraq', 'iraqi']],
  ['Iran', ['irn', 'iran', 'iranian', 'persian']],
  ['Syria', ['syr', 'syria', 'syrian']],
  ['Lebanon', ['leb', 'lebanon', 'lebanese']],
  ['Yemen', ['yem', 'yemen', 'yemeni']],
  ['Sudan', ['sdn', 'sudan', 'sudanese']],
  ['Somalia', ['som', 'somalia', 'somali']],
  ['Djibouti', ['dji', 'djibouti', 'djiboutian']],
  ['Turkey', ['tur', 'turkey', 'turkish', 'turkiye']],
  ['Ukraine', ['ukr', 'ukraine', 'ukrainian']],
  ['Russia', ['rus', 'russia', 'russian']],
  ['Azerbaijan', ['aze', 'azerbaijan', 'azerbaijani', 'azeri']],
  ['Uzbekistan', ['uzb', 'uzbek', 'uzbekistan']],
  ['Kazakhstan', ['kaz', 'kazakh', 'kazakhstan']],
  ['Kyrgyzstan', ['kgz', 'kyrgyz', 'kyrgyzstan']],
  ['Tajikistan', ['tjk', 'tajik', 'tajikistan']],
  ['Nigeria', ['nga', 'nigeria', 'nigerian']],
  ['Kenya', ['ken', 'kenya', 'kenyan']],
  ['Ethiopia', ['eth', 'ethiopia', 'ethiopian']],
  ['Uganda', ['uga', 'uganda', 'ugandan']],
  ['Ghana', ['gha', 'ghana', 'ghanaian']],
  ['South Africa', ['zaf', 'southafrica', 'southafrican']],
  ['United Arab Emirates', ['uae', 'emirati', 'emirates', 'unitedarabemirates', 'are']],
  ['Saudi Arabia', ['ksa', 'saudi', 'saudiarabia', 'saudiarabian', 'sau']],
  ['Oman', ['omn', 'oman', 'omani']],
  ['Qatar', ['qat', 'qatar', 'qatari']],
  ['Kuwait', ['kwt', 'kuwait', 'kuwaiti']],
  ['Bahrain', ['bhr', 'bahrain', 'bahraini']],
  ['United Kingdom', ['uk', 'gbr', 'unitedkingdom', 'british', 'britain', 'england', 'english']],
  ['United States', ['usa', 'us', 'unitedstates', 'american', 'america']],
  ['Canada', ['can', 'canada', 'canadian']],
  ['Australia', ['aus', 'australia', 'australian']],
  ['China', ['chn', 'china', 'chinese']],
  ['Indonesia', ['idn', 'indonesia', 'indonesian']],
  ['Malaysia', ['mys', 'malaysia', 'malaysian']],
  ['Thailand', ['tha', 'thailand', 'thai']],
  ['Vietnam', ['vnm', 'vietnam', 'vietnamese']],
  ['Morocco', ['mar', 'morocco', 'moroccan']],
  ['Tunisia', ['tun', 'tunisia', 'tunisian']],
  ['Algeria', ['dza', 'algeria', 'algerian']],
];

function normalise(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Build a lookup of exact normalised variant -> canonical label.
const EXACT = new Map<string, string>();
for (const [label, variants] of COUNTRY_ROOTS) {
  EXACT.set(normalise(label), label);
  for (const v of variants) EXACT.set(normalise(v), label);
}

/**
 * Fold a raw nationality string onto a canonical country label.
 * Unknown values are returned Title Cased rather than dropped, so nothing is
 * ever silently lost from the filter list.
 */
export function canonicalNationality(raw: string | null | undefined): string {
  const n = normalise(raw ?? '');
  if (!n) return '';

  const exact = EXACT.get(n);
  if (exact) return exact;

  // Prefix match in both directions so "turkemistan" reaches "turkem" and
  // "indianational" reaches "indian".
  let best: { label: string; score: number } | null = null;
  for (const [label, variants] of COUNTRY_ROOTS) {
    for (const v of variants) {
      const nv = normalise(v);
      if (nv.length < 3) continue;
      if (n.startsWith(nv) || nv.startsWith(n)) {
        const score = Math.min(n.length, nv.length);
        if (!best || score > best.score) best = { label, score };
      }
    }
  }
  if (best) return best.label;

  // Unknown: Title Case the original so it still groups by exact spelling.
  const cleaned = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}
