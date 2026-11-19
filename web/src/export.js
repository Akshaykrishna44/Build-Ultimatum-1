import { grossQty, netQty, num } from './calc.js'

let dlPromise = null
function getDownloads() {
  if (!dlPromise) {
    dlPromise =
      typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function'
        ? window.claude.use('downloads').catch(() => null)
        : Promise.resolve(null)
  }
  return dlPromise
}

/** Save a file: claude.ai downloads capability → browser download → clipboard fallback (text only).
 *  `text` may also be bytes (Uint8Array) for PDF / Excel files (spec 015). */
export async function saveFile(filename, text, mime = 'text/plain') {
  const binary = typeof text !== 'string'
  const dl = await getDownloads()
  if (dl) {
    await dl.save({ filename, data: binary ? new Blob([text], { type: mime }) : text })
    return 'saved'
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return 'saved'
  } catch (e) {
    if (binary) throw e
    await navigator.clipboard.writeText(text)
    return 'copied'
  }
}

const csvCell = (v) => {
  // Bug sweep 2026-11-19: text starting with = + - @ would run as a formula in Excel; numbers are left alone
  let s = String(v ?? '')
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

export { csvCell }

export function bomCSV(est, qty) {
  const rows = [['Component', 'Material', 'Grade', 'Consumption/unit', 'Unit', 'Net qty', 'Wastage %', 'Gross qty', 'Rate low', 'Rate likely', 'Rate high', 'Cost likely', 'Note']]
  for (const b of est.bom || []) {
    const g = grossQty(b, qty)
    rows.push([b.component, b.material, b.grade, b.consumption_per_unit, b.unit, netQty(b, qty).toFixed(2), b.wastage_pct, g.toFixed(2), b.rate_low, b.rate_likely, b.rate_high, (g * num(b.rate_likely)).toFixed(2), b.note])
  }
  return csv(rows)
}

export function costSheetCSV(totals) {
  const lines = [
    ['Materials (incl. wastage)', 'material'],
    ['Labour', 'labour'],
    ['One-time costs charged', 'oneTime'],
    ['Packaging, logistics, utilities', 'perUnit'],
    ['Direct cost', 'direct'],
    ['Overhead', 'overhead'],
    ['Contingency', 'contingency'],
    ['Total cost', 'cost'],
    ['Margin', 'margin'],
    ['Tax', 'tax'],
    ['GRAND TOTAL', 'total'],
    ['Price per unit', 'perUnitTotal'],
  ]
  return csv([['Line', 'Low', 'Likely', 'High'], ...lines.map(([l, k]) => [l, totals.low[k].toFixed(2), totals.likely[k].toFixed(2), totals.high[k].toFixed(2)])])
}

export function reportMarkdown(req, map, est, totals, pct, money) {
  const m = (n) => money(n, req.currency)
  const L = []
  L.push(`# ${est.product_title || map.product_title}`)
  L.push(`**Quantity:** ${req.qty} ${req.unit} · **Location:** ${req.location} · **Currency:** ${req.currency}`)
  L.push(`\n${est.summary || map.summary}\n`)
  L.push(`_Price basis: ${est.price_basis || 'AI market estimate'} — verify with supplier quotes._\n`)
  L.push(`## Estimate summary`)
  L.push(`| | Low | Likely | High |\n|---|---|---|---|`)
  for (const [l, k] of [['Materials', 'material'], ['Labour', 'labour'], ['One-time', 'oneTime'], ['Packaging/logistics/utilities', 'perUnit'], [`Overhead (${pct.overhead_pct}%)`, 'overhead'], [`Contingency (${pct.contingency_pct}%)`, 'contingency'], [`Margin (${pct.margin_pct}%)`, 'margin'], [`Tax (${pct.tax_pct}%)`, 'tax'], ['**Grand total**', 'total'], ['Per unit', 'perUnitTotal']])
    L.push(`| ${l} | ${m(totals.low[k])} | ${m(totals.likely[k])} | ${m(totals.high[k])} |`)
  L.push(`\n## Bill of materials`)
  L.push(`| Component | Material | Cons./unit | Wastage | Gross qty | Rate (likely) | Cost |\n|---|---|---|---|---|---|---|`)
  for (const b of est.bom || []) {
    const g = grossQty(b, req.qty)
    L.push(`| ${b.component} | ${b.material} ${b.grade ? '(' + b.grade + ')' : ''} | ${b.consumption_per_unit} ${b.unit} | ${b.wastage_pct}% | ${g.toFixed(1)} ${b.unit} | ${m(b.rate_likely)} | ${m(g * num(b.rate_likely))} |`)
  }
  L.push(`\n## Sourcing`)
  for (const s of est.sourcing || []) L.push(`- **${s.material}** — ${s.region} (${s.source_type}), ${s.price_range}, grade ${s.quality_grade}, lead ${s.lead_time}, MOQ ${s.moq}. ${s.notes || ''}`)
  L.push(`\n## Assumptions`)
  for (const a of est.assumptions || []) L.push(`- ${a}`)
  L.push(`\n## Risks`)
  for (const r of est.risks || []) L.push(`- **${r.risk}** — ${r.mitigation}`)
  return L.join('\n')
}
