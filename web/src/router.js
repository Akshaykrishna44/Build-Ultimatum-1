// ─────────────────────────────────────────────────────────────
// Universal router: one question box for anything.
//   "500 ICU ventilators"          → AI product engine + Medical pack
//   "PEB warehouse 80 × 40 m"      → Building engine (warehouse)
//   "garment factory in Tiruppur"  → ambiguous: build the factory OR make garments? Offer both.
// Rules live in domainPacks.json (shared with the Python engine).
// ─────────────────────────────────────────────────────────────
import PACKS from './domainPacks.json'
import { matchPacks } from './ai.js'

const R = PACKS.router
const has = (text, k) => new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?([^a-z]|$)').test(text)
const firstMatch = (text, table) => Object.entries(table).find(([, words]) => words.some((w) => has(text, w)))?.[0]

/** Pull "60 x 30 m" / "60m × 30m" style dimensions out of free text. */
function dimensions(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*m?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*m\b/)
  return m ? { length: Math.max(+m[1], +m[2]), width: Math.min(+m[1], +m[2]) } : null
}

export function route(req) {
  const text = ' ' + [req.product, req.notes].join(' ').toLowerCase().replace(/-/g, ' ') + ' '
  const packs = matchPacks(req)
  const isBuilding = R.building_keywords.some((k) => has(text, k))
  const ambiguous = !isBuilding && R.ambiguous_keywords.some((k) => has(text, k))
  const prefill = {}
  const pt = firstMatch(text, R.project_type)
  if (pt) prefill.project_type = pt
  const ic = firstMatch(text, R.industry_class)
  if (ic && (prefill.project_type || 'industrial') === 'industrial') {
    prefill.project_type = 'industrial'
    prefill.industry_class = ic
  }
  const fl = text.match(/(\d+)\s*(?:floors?|storeys?|stories)/)
  if (fl) prefill.floors = +fl[1]
  const cr = text.match(/(\d+)\s*(?:t|ton|tons|tonne|tonnes)\s*(?:eot\s*)?crane/)
  if (cr) {
    const caps = [5, 10, 20, 30, 50]
    prefill.crane = String(caps.reduce((a, b) => (Math.abs(b - +cr[1]) < Math.abs(a - +cr[1]) ? b : a)))
  }
  const dim = dimensions(text)
  if (dim) Object.assign(prefill, dim)
  if (!dim && /sq\.?\s*ft|sqft|square feet/.test((req.unit || '') + text) && Number(req.qty) > 0) {
    // area given → square-ish footprint
    const m2 = Number(req.qty) / 10.7639
    const w = Math.round(Math.sqrt(m2 / 2))
    Object.assign(prefill, { width: w, length: Math.round(m2 / w) })
  }
  const engine = isBuilding ? 'building' : 'ai'
  return {
    engine,
    ambiguous,
    packs,
    prefill,
    label: isBuilding ? 'Building & construction engine' : packs.length ? packs.map((p) => p.label).join(' + ') + ' (AI product engine)' : 'AI product engine (general)',
  }
}

const UNIT_WORDS = ['pairs', 'pair', 'pieces', 'pcs', 'piece', 'units', 'unit', 'nos', 'numbers', 'acres', 'acre', 'hectares', 'cans', 'bottles', 'packs', 'boxes', 'kg', 'kgs', 'tonnes', 'tonne', 'tons', 'litres', 'liters', 'metres', 'meters', 'sets', 'sq ft', 'sqft', 'sq m']
const SCALE = { lakh: 1e5, lakhs: 1e5, lac: 1e5, crore: 1e7, crores: 1e7, thousand: 1e3, million: 1e6 }
// Numbers followed by these are specifications or sizes, not the order quantity
const SPEC = /^(-?\s?(inch|inches|in|mm|cm|m|ft|feet|floors?|storeys?|stories|kva|kw|w|watt|hp|v|volt|amp|a|g|gm|gram|grams|ml|l|k|p|hz|gb|tb|mah|bhk|°|x|×|%|t\s*(eot\s*)?crane|tonnes?\s*(eot\s*)?crane|ton\s*(eot\s*)?crane))(?![a-z])/

/** "500 ICU ventilators" → {qty:500, unit:'units'} · "2 lakh T-shirts" → 200000 pieces · "100 acres of paddy" → 100 acres */
export function parseQuantity(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/(\d),(?=\d)/g, '$1') + ' '
  const re = /(\d+(?:\.\d+)?)(?:\s*(lakhs?|lac|crores?|thousand|million)\b)?/g
  let m
  while ((m = re.exec(t))) {
    const prev = t[m.index - 1]
    if (prev && /[a-z0-9.×]/.test(prev)) continue // part of a word or a decimal
    const after = t.slice(m.index + m[0].length).replace(/^\s+/, '')
    if (SPEC.test(after)) continue
    if (/^\s*(x|×|by)\s*\d/.test(t.slice(m.index + m[0].length))) continue // 80 × 40
    const qty = +m[1] * (SCALE[m[2]] || 1)
    const unitWord = UNIT_WORDS.find((u) => new RegExp('^' + u + '(?![a-z])').test(after))
    const unit = unitWord
      ? { pair: 'pairs', pcs: 'pieces', piece: 'pieces', unit: 'units', acre: 'acres', tonne: 'tonnes', tons: 'tonnes', kgs: 'kg', liters: 'litres', meters: 'metres', numbers: 'nos' }[unitWord] || unitWord
      : /shoe|sock|glove|slipper|sandal/.test(t) ? 'pairs' : /shirt|garment|dress|uniform|jeans|saree/.test(t) ? 'pieces' : 'units'
    return { qty, unit }
  }
  return null
}
