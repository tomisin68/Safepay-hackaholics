/**
 * AI dispute triage.
 *
 * A dispute arrives as free text from someone who is upset. Before a human ever
 * reads it we classify it, estimate severity, and surface the questions an
 * agent should ask — which is what actually cuts resolution time.
 *
 * If GEMINI_API_KEY is absent (or the call fails, or the model returns junk) we
 * fall back to a deterministic rule-based classifier. The product never depends
 * on a third party being up.
 */

export const CATEGORIES = {
  non_delivery: {
    label: 'Non-delivery',
    guidance: 'Ask the seller for proof of dispatch and a tracking reference.',
  },
  not_as_described: {
    label: 'Item not as described',
    guidance: 'Request photos from the buyer and the original listing from the seller.',
  },
  service_incomplete: {
    label: 'Service incomplete',
    guidance: 'Compare delivered work against the agreed milestone scope.',
  },
  partial_delivery: {
    label: 'Partial delivery',
    guidance: 'A split release is usually the fastest fair outcome here.',
  },
  damaged: {
    label: 'Arrived damaged',
    guidance: 'Ask for photos of the packaging as well as the item.',
  },
  likely_fraud: {
    label: 'Likely fraud',
    guidance: 'Freeze the counterparty account and escalate to compliance before refunding.',
  },
  buyer_remorse: {
    label: 'Buyer changed their mind',
    guidance: 'Not covered by SafePay protection unless the seller offers returns.',
  },
  other: { label: 'Needs human review', guidance: 'Read the full thread and evidence.' },
};

const RULES = [
  { category: 'likely_fraud', severity: 'critical', weight: 5, patterns: [/\bscam(mer)?\b/i, /\bfraud\b/i, /fake (account|profile|receipt)/i, /blocked me/i, /stopped (replying|responding)/i, /disappeared/i, /\bran away\b/i] },
  { category: 'non_delivery', severity: 'high', weight: 4, patterns: [/never (arrived|received|delivered|came)/i, /(didn.?t|did not|have not|haven.?t) (receive|get|arrive)/i, /no (item|package|delivery|parcel)/i, /still waiting/i, /not deliver/i] },
  { category: 'damaged', severity: 'high', weight: 4, patterns: [/\bdamaged?\b/i, /\bbroken\b/i, /\bcracked\b/i, /\bsmashed\b/i, /\bfaulty\b/i, /not working/i, /\bdefect/i] },
  { category: 'not_as_described', severity: 'medium', weight: 3, patterns: [/not (as|what) (described|advertised|shown|ordered)/i, /different (colour|color|size|item|model)/i, /wrong (item|size|colour|color|product)/i, /\bcounterfeit\b/i, /\bfake\b/i, /looks nothing like/i] },
  { category: 'service_incomplete', severity: 'medium', weight: 3, patterns: [/(didn.?t|did not|never) (finish|complete|deliver the work)/i, /incomplete/i, /half.?(done|finished)/i, /abandoned the (job|project|work)/i, /milestone/i] },
  { category: 'partial_delivery', severity: 'medium', weight: 3, patterns: [/only (received|got|sent) (part|some|\d)/i, /partial/i, /missing (items?|pieces?|parts?)/i, /\d+ (out )?of \d+/i] },
  { category: 'buyer_remorse', severity: 'low', weight: 2, patterns: [/changed my mind/i, /no longer (need|want)/i, /found (it )?cheaper/i, /don.?t want it anymore/i] },
];

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

export function ruleClassify(text = '') {
  const scores = new Map();
  let severity = 'low';

  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(text)).length;
    if (!hits) continue;
    scores.set(rule.category, (scores.get(rule.category) ?? 0) + hits * rule.weight);
    if (SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[severity]) severity = rule.severity;
  }

  if (scores.size === 0) {
    return {
      category: 'other',
      label: CATEGORIES.other.label,
      severity: 'medium',
      confidence: 0.3,
      summary: text.trim().slice(0, 180) || 'No description supplied.',
      guidance: CATEGORIES.other.guidance,
      source: 'rules',
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [category, top] = ranked[0];
  const total = ranked.reduce((s, [, v]) => s + v, 0);

  return {
    category,
    label: CATEGORIES[category].label,
    severity,
    confidence: Math.min(0.92, 0.45 + (top / total) * 0.45),
    summary: text.trim().slice(0, 180),
    guidance: CATEGORIES[category].guidance,
    source: 'rules',
  };
}

const PROMPT = `You triage payment-escrow disputes for a Nigerian escrow platform.
Classify the dispute into exactly one category:
${Object.entries(CATEGORIES).map(([k, v]) => `- ${k}: ${v.label}`).join('\n')}

Respond with ONLY minified JSON, no markdown fence:
{"category":"<key>","severity":"low|medium|high|critical","confidence":0.0-1.0,"summary":"<one sentence, max 25 words>","guidance":"<one action for the reviewing agent, max 20 words>"}`;

async function geminiClassify(text, context) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  // gemini-2.0-flash was retired by Google; gemini-3.6-flash is its replacement.
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: `Escrow type: ${context.type}\nAmount: NGN ${context.amountNaira}\nRaised by: ${context.raisedByRole}\n\nDispute:\n${text}` }],
        }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 300 },
      }),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('empty response');

    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    if (!CATEGORIES[parsed.category]) throw new Error(`unknown category ${parsed.category}`);

    return {
      category: parsed.category,
      label: CATEGORIES[parsed.category].label,
      severity: ['low', 'medium', 'high', 'critical'].includes(parsed.severity) ? parsed.severity : 'medium',
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
      summary: String(parsed.summary ?? '').slice(0, 240),
      guidance: String(parsed.guidance ?? CATEGORIES[parsed.category].guidance).slice(0, 240),
      source: `gemini:${model}`,
    };
  } catch (err) {
    console.warn('[aiTriage] falling back to rules:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function triage(text, context = {}) {
  const ai = await geminiClassify(text, {
    type: context.type ?? 'goods',
    amountNaira: context.amountNaira ?? 0,
    raisedByRole: context.raisedByRole ?? 'buyer',
  });
  return { ...(ai ?? ruleClassify(text)), triagedAt: new Date().toISOString() };
}
