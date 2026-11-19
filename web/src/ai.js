// ─────────────────────────────────────────────────────────────
// "Claude mode" AI adapter: used when the app runs inside claude.ai (built-in "sample"
// capability). When the Python Ultimatum Engine API is available, engine.js uses the API instead
// and these prompts run server-side (engine/ultimatum/prompts.py).
// The AI does the THINKING (questions, domain knowledge, options, rates).
// The arithmetic is done in calc.js — never by the AI.
// ─────────────────────────────────────────────────────────────

let samplePromise = null
function getSample() {
  if (!samplePromise) {
    samplePromise =
      typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function'
        ? window.claude.use('sample').catch(() => null)
        : Promise.resolve(null)
  }
  return samplePromise
}

export async function aiAvailable() {
  const s = await getSample()
  if (s) return 'claude'
  return 'server'
}

/** messages: string | [{role, content}]  → full text. onText(fullTextSoFar) streams progress. */
export async function askAI(messages, { onText, tier = 'complex', signal } = {}) {
  const sample = await getSample()
  if (sample) {
    try {
      const r = await sample(messages, {
        modelTier: tier,
        cache: false,
        signal,
        onText: onText ? ({ text }) => onText(text) : undefined,
      })
      return { text: r.text, truncated: r.truncated }
    } catch (e) {
      if (e && e.code === 'not_granted') throw new Error('Permission to ask Claude was not granted. Allow it and try again.')
      if (e && e.code === 'rate_limited') throw new Error('Too many AI requests right now. Wait a minute and try again.')
      throw new Error((e && e.message) || 'The AI request failed.')
    }
  }
  throw new Error('Claude is not available in this view. Run the Ultimatum Engine API (see README) or open the app on claude.ai.')
}

// ── Robust JSON reader for real model output (bug sweep 2026-11-19, mirrored in engine/ultimatum/llm.py) ──
// Handles: prose and markdown fences around the JSON, braces in the prose, an example object before the real
// one (the largest valid object wins), // and /* */ comments, trailing commas, NaN / Infinity, curly quotes, and
// answers cut off part-way (rebuilt from the last complete item and flagged __truncated so callers can warn).

/** One pass outside strings: drop comments, turn NaN/Infinity into null, drop trailing commas. */
function cleanJSONText(t) {
  let out = ''
  let inStr = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      out += c
      if (c === '\\') out += t[++i] ?? ''
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 1; continue }
    if (t.startsWith('-Infinity', i) && !/[\w"]/.test(t[i - 1] || '')) { out += 'null'; i += 8; continue }
    if ((t.startsWith('NaN', i) || t.startsWith('Infinity', i)) && !/[\w"]/.test(t[i - 1] || '')) { const w = t.startsWith('NaN', i) ? 3 : 8; out += 'null'; i += w - 1; continue }
    if (c === ',') { let j = i + 1; while (/\s/.test(t[j] || '')) j++; if (t[j] === '}' || t[j] === ']') continue }
    out += c
  }
  return out
}

/** Scan from `start` (a '{'): returns { end } for a complete object, or { cut, stack } for the best truncation repair. */
function scanObject(t, start) {
  const stack = []
  let inStr = false
  let cut = -1
  let cutStack = null
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') {
      stack.pop()
      if (!stack.length) return { end: i }
    } else if (c === ',') {
      cut = i
      cutStack = [...stack]
    }
  }
  return { cut, stack: cutStack }
}

function tryParse(s) {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

function repairFrom(t, start) {
  const r = scanObject(t, start)
  if (r.end !== undefined || r.cut < 0) return null
  const closers = r.stack.slice().reverse().map((b) => (b === '{' ? '}' : ']')).join('')
  const v = tryParse(cleanJSONText(t.slice(start, r.cut) + closers))
  if (v) Object.defineProperty(v, '__truncated', { value: true, enumerable: false })
  return v ? { v, len: r.cut - start } : null
}

function readJSON(raw) {
  const t = cleanJSONText(raw)
  let best = null
  let bestLen = -1
  for (let i = t.indexOf('{'); i >= 0; i = t.indexOf('{', i + 1)) {
    const r = scanObject(t, i)
    if (r.end === undefined) {
      // this object never closes: the answer was cut off; everything after it is inside it
      const rep = repairFrom(t, i)
      if (rep && rep.len > bestLen) best = rep.v
      break
    }
    const v = tryParse(t.slice(i, r.end + 1))
    if (v && r.end + 1 - i > bestLen) {
      best = v
      bestLen = r.end + 1 - i
    }
    if (v) i = r.end // skip the nested objects of a valid one
  }
  return best
}

export function parseJSON(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').replace(/```(?:json)?/gi, '')
  let v = readJSON(t)
  if (!v && /[“”]/.test(t)) v = readJSON(t.replace(/[“”]/g, '"'))
  if (!v) throw new Error('The AI did not return structured data. Please retry.')
  return v
}

export async function askJSON(prompt, opts) {
  const r = await askAI(prompt, opts)
  try {
    const v = parseJSON(r.text)
    if (r.truncated && !v.__truncated) Object.defineProperty(v, '__truncated', { value: true, enumerable: false })
    return v
  } catch (e) {
    if (r.truncated) throw new Error('The answer was too long and got cut off. Retry, or narrow the request.')
    throw e
  }
}

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

import PACKS from './domainPacks.json'
import { INDIA } from './india.js'

export const STAGES = [
  'Classification & intended use',
  'Purpose & market',
  'Quantity & timeline',
  'Variants & specifications',
  'Components',
  'Raw materials & grades',
  'Losses & wastage',
  'Process & machinery',
  'Workforce',
  'Infrastructure & utilities',
  'Compliance & quality',
  'Sourcing & procurement',
  'Packaging & logistics',
  'Commercial terms',
  'Risk',
]

/** Match domain packs by whole-word keywords in the request. */
export function matchPacks(req) {
  const text = ' ' + [req.product, req.notes].join(' ').toLowerCase() + ' '
  return PACKS.packs.filter((p) => p.keywords.some((k) => new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?([^a-z]|$)').test(text)))
}

export function domainBlock(req) {
  const packs = matchPacks(req)
  return `EXPERT GUIDANCE\n- ${PACKS.universal}` + packs.map((p) => `\n- ${p.label.toUpperCase()}: ${p.hints}`).join('')
}

function stageList(req) {
  const extra = matchPacks(req).flatMap((p) => p.stages || [])
  const list = [...STAGES]
  list.splice(1, 0, ...extra.filter((x) => !list.includes(x)))
  return list
}

function requestBlock(req) {
  return `CLIENT REQUEST
- What they want: ${req.product}
- Quantity: ${Number(req.qty) > 0 ? req.qty + ' ' + req.unit : 'not stated yet (ask it in the Quantity stage)'}
- Location: ${req.location || 'a state in India, not stated yet (asked in the interview)'}
- Currency: INR (₹)
${INDIA}
- Extra notes: ${req.notes || 'none'}`
}

export function researchPrompt(req) {
  return `You are a senior domain engineer, industrial cost estimator and sourcing expert with deep knowledge of every industry (manufacturing, electronics, construction, agriculture, textiles, food, chemicals, services, etc.).

${requestBlock(req)}

${domainBlock(req)}

TASK: Research this product/project as an expert would and design the requirement-gathering INTERVIEW you would run with this client, from the very basics to every detail needed for a complete cost estimate (classification and regulation, numbers and volumes, assemblies, raw materials, types, grades, wastage, process, labour, packaging, overheads, contingency, margin, sourcing, compliance, risk).

Use these stages in this order (skip a stage only if truly irrelevant): ${stageList(req).join(' | ')}.
The first stage classifies the product (category, sub-type, regulatory/risk class, variant) because every later question depends on it.
For each stage write 2–3 sharp, domain-specific questions (about 30–40 questions total).
Rules for questions:
- Prefer "single" or "multi" choice with 3–7 realistic options; every option has a short expert note (price/quality/use implication).
- Use "number" for numeric inputs (give unit and an industry-typical default), "text" only when unavoidable.
- "default" must be the industry-typical choice (for single: one option value; for multi: array of values; for number: a number).
- "why" = one short line on why an expert asks this.
- The Quantity stage MUST include a number question with id "order_qty" ("How many … do you need?"), whose "unit" is the counting unit (units, pairs, pieces, acres, kg, litres…) and whose default is the client's stated quantity, or a typical order size if none was stated.
- Commercial stage MUST include numeric questions with ids overhead_pct, contingency_pct, margin_pct, tax_pct (percentages, with typical defaults for this domain in India; tax_pct is the GST slab).

- raw_materials: 6–12 rows, the main raw materials and key bought components this needs, shown to the client BEFORE the interview. India first; imported: true only when nothing suitable is found in India (then give origin).

Return ONLY JSON, no prose, in exactly this shape:
{
 "domain": "short domain name",
 "product_title": "clear title",
 "summary": "2-3 sentence expert overview of what making/delivering this involves",
 "key_considerations": ["5-7 short expert points"],
 "raw_materials": [{"material":"name","used_for":"which part / purpose","grades":["2-4 grades or types"],"india_sources":["2-3 places / clusters / supplier types in India"],"typical_price":"₹ range with unit, e.g. ₹90–180 per sq ft","imported":false,"origin":"country, only if imported"}],
 "stages": [
  {"id":"s1","title":"Purpose & market","intro":"one line",
   "questions":[
    {"id":"q_short_snake","q":"question text","why":"why it matters","type":"single|multi|number|text",
     "options":[{"value":"opt_value","label":"Option label","note":"expert note"}],
     "unit":"for number type","default":"..."}
   ]}
 ]
}`
}

export function answersBlock(map, answers) {
  const lines = []
  for (const st of map.stages || []) {
    for (const q of st.questions || []) {
      let a = answers[q.id]
      if (Array.isArray(a)) {
        a = a.map((v) => (q.options || []).find((o) => o.value === v)?.label || v).join(', ')
      } else if (q.options && q.options.length) {
        a = q.options.find((o) => o.value === a)?.label || a
      }
      const other = answers[q.id + '__other']
      if (other) a = (a ? a + '; ' : '') + 'Other: ' + other
      if (a === undefined || a === '' || a === null) a = 'not answered (use expert default)'
      lines.push(`[${st.title}] ${q.q} → ${a}${q.unit ? ' ' + q.unit : ''}`)
    }
  }
  return lines.join('\n')
}

export function estimatePrompt(req, map, answers) {
  return `You are a senior domain engineer, industrial cost estimator and procurement/sourcing expert.

${requestBlock(req)}

PRODUCT: ${map.product_title} (domain: ${map.domain})

CLIENT ANSWERS FROM THE INTERVIEW
${answersBlock(map, answers)}

${domainBlock(req)}

TASK: Produce the complete expert estimate data for the client's chosen configuration, for the full quantity, from raw materials to finished delivery. Use realistic current market rates for ${req.location || 'the client market'} in INR. You will NOT total anything — a calculation engine does all arithmetic, so give unit-level figures only.

Rules:
- bom: 12–30 rows, a MULTI-LEVEL bill covering EVERY assembly, component, raw material, consumable and PACKAGING item from base to finished, packed product. Each row: assembly (module it belongs to, e.g. "Pneumatic module", "Packaging"), category (raw_material | component | sub_assembly | consumable | packaging), make_or_buy (make | buy), consumption_per_unit = amount for ONE ${req.unit.replace(/s$/, '')} before wastage, wastage_pct = realistic loss, wastage_reason = the process cause (e.g. "SMT attrition", "runner regrind not allowed", "final-test rejection", "cutting/nesting"). rate_low/likely/high = INR per consumption unit (low = budget source, high = premium).
- options_catalog: 4–8 categories (types, materials, finishes, sizes/capacities, construction methods, packaging...) each with 3–6 options so the client sees EVERY available choice, with cost impact and quality.
- breakdowns: quantity mix tables where relevant (e.g. size mix, model mix, crop area split). share_pct per table sums to 100.
- sourcing: 6–12 rows — where to buy each key material (city / cluster / state in India), source type (manufacturer, wholesaler, mandi, importer, B2B portal), price range text, quality grade A/B/C, lead time, MOQ.
- labour: every skill/trade, minutes_per_unit (per ONE unit of output), rate_per_hour in INR, headcount needed to meet the timeline.
- one_time_costs: R&D/design, tooling, moulds, dies, fixtures, test jigs, certification and regulatory, testing/validation, line setup, machinery. Each has category (rnd | tooling | certification | setup | machinery). include_in_order=true only for costs charged to this order.
- per_unit_costs: packaging, logistics, utilities per ONE unit.
- percentages: use the client's answers for overhead/contingency/margin/tax if given, else domain-typical.
- market_price: typical selling price per unit in this market for comparison.

Return ONLY JSON in exactly this shape (keep strings short):
{
 "product_title":"", "summary":"", "unit_label":"${req.unit}", "price_basis":"what the rates are based on, with month/year",
 "options_catalog":[{"category":"","options":[{"name":"","description":"","cost_impact":"","quality":"","best_for":""}]}],
 "breakdowns":[{"title":"","rows":[{"label":"","share_pct":0}]}],
 "bom":[{"assembly":"","component":"","material":"","grade":"","category":"component","make_or_buy":"buy","consumption_per_unit":0,"unit":"","wastage_pct":0,"wastage_reason":"","rate_low":0,"rate_likely":0,"rate_high":0,"note":""}],
 "sourcing":[{"material":"","region":"","source_type":"","price_range":"","quality_grade":"A","lead_time":"","moq":"","notes":""}],
 "labour":[{"skill":"","minutes_per_unit":0,"rate_per_hour":0,"headcount":0}],
 "one_time_costs":[{"item":"","category":"tooling","qty":1,"unit_cost":0,"include_in_order":true,"note":""}],
 "per_unit_costs":{"packaging":0,"logistics":0,"utilities":0},
 "percentages":{"overhead_pct":0,"contingency_pct":0,"margin_pct":0,"tax_pct":0},
 "market_price":{"low":0,"likely":0,"high":0,"note":""},
 "process_steps":[{"step":"","description":"","machine":""}],
 "compliance":[""],
 "timeline":[{"phase":"","duration":""}],
 "assumptions":[""],
 "risks":[{"risk":"","mitigation":""}]
}`
}

export function followupsPrompt(req, map, answers, stage) {
  const existing = map.stages.flatMap((s) => s.questions.map((q) => q.id))
  return `TASK: FOLLOWUPS
You are a senior domain engineer, industrial cost estimator and sourcing expert.

${requestBlock(req)}
PRODUCT: ${map.product_title} (domain: ${map.domain})

ANSWERS SO FAR:
${answersBlock(map, answers)}

The client just finished the stage "${stage.title}". What DEEPER questions do their specific answers raise that the
interview has not asked yet? (Example: Goodyear welt construction raises welt-strip and cork-filler questions.)
Return 0–3 questions, or an empty list if nothing important is missing. Do not reuse these ids: ${JSON.stringify(existing)}

Return ONLY JSON: {"questions":[{"id":"q_short_snake","q":"","why":"","type":"single|multi|number|text","options":[{"value":"","label":"","note":""}],"unit":"","default":""}]}`
}

export function expertContext(req, map, answers, totalsText) {
  return `You are the client's senior domain expert, estimator and sourcing advisor for this project. Answer practically and specifically (numbers, grades, places, suppliers types, standards). Be concise. Say clearly when a figure is an estimate that should be verified with quotes.

${requestBlock(req)}
${map ? `PRODUCT: ${map.product_title} (domain: ${map.domain})\nSUMMARY: ${map.summary}` : ''}
${map && answers ? `CLIENT ANSWERS SO FAR:\n${answersBlock(map, answers)}` : ''}
${totalsText ? `CURRENT ESTIMATE:\n${totalsText}` : ''}`
}
