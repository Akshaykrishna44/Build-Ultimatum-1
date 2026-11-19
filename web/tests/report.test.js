import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
import { unzipSync, strFromU8 } from 'fflate'
import { productReport, buildingReport, sourcingReport } from '../src/report/model.js'
import { renderPDF } from '../src/report/pdf.js'
import { renderXLSX } from '../src/report/xlsx.js'
import { calculate } from '../src/calc.js'
import { compute } from '../src/domains/building/takeoff.js'
import { withDefaults } from '../src/domains/building/questions.js'
import { DEFAULT_RATES } from '../src/domains/building/rates.js'
import { normaliseEstimate } from '../src/estimate.js'
import { parseSourcing } from '../src/understand.js'

const req = { product: 'mobile manufacturing', qty: 5000, unit: 'units', location: 'Noida, India', currency: 'INR', notes: 'Mid-range 5G phones.' }
const map = {
  domain: 'Electronics', product_title: 'Smartphones', summary: 'Assembling smartphones in India.', key_considerations: ['SoC is the largest cost'],
  raw_materials: [{ material: 'Application processor', used_for: 'Main board', grades: ['6 nm'], india_sources: ['Distributors, Bengaluru'], typical_price: '₹2,400–4,800', imported: true, origin: 'Taiwan' }],
  stages: [{ id: 's1', title: 'Classification', questions: [
    { id: 'segment', q: 'Which segment?', type: 'single', options: [{ value: 'mid', label: 'Mid 5G' }, { value: 'entry', label: 'Entry 4G' }], default: 'entry' },
    { id: 'order_qty', q: 'How many phones?', type: 'number', unit: 'units', default: 1000 },
    { id: 'notes', q: 'Anything else?', type: 'text' },
  ] }],
}
const answers = { segment: 'mid', order_qty: 5000 }
const est = normaliseEstimate({
  product_title: 'Mid-range 5G smartphone', summary: 'Assembled via EMS.', price_basis: 'Sample, Nov 2026',
  options_catalog: [{ category: 'Display', options: [{ name: 'LCD', cost_impact: 'Base', quality: 'Good', best_for: 'Budget' }] }],
  breakdowns: [{ title: 'Colour mix', rows: [{ label: 'Black', share_pct: 60 }, { label: 'Blue', share_pct: 40 }] }],
  bom: [
    { assembly: 'Main board', component: 'SoC', material: '=HYPERLINK("http://x")', category: 'component', consumption_per_unit: 1, unit: 'pc', wastage_pct: 0.3, wastage_reason: 'SMT attrition', rate_low: 3200, rate_likely: 3600, rate_high: 4100 },
    { assembly: 'Display', component: 'Display', material: 'LCD', category: 'component', consumption_per_unit: 1, unit: 'pc', wastage_pct: 1, wastage_reason: 'breakage', rate_low: 950, rate_likely: 1100, rate_high: 1300 },
  ],
  sourcing: [{ material: 'SoC', region: 'Bengaluru', source_type: 'importer', price_range: '₹3,200–4,100', quality_grade: 'A', lead_time: '6 weeks', moq: '1 reel' }],
  labour: [{ skill: 'Assembly', minutes_per_unit: 9, rate_per_hour: 160, headcount: 22 }],
  one_time_costs: [{ item: 'BIS + WPC approvals', qty: 1, unit_cost: 650000, include_in_order: true }],
  per_unit_costs: { logistics: 45 }, percentages: { overhead_pct: 8, contingency_pct: 4, margin_pct: 12, tax_pct: 18 },
  market_price: { low: 12999, likely: 14999, high: 16999 },
  process_steps: [{ step: 'SMT', description: 'Pick and place' }], compliance: ['BIS CRS'], timeline: [{ phase: 'Approvals', duration: '6 weeks' }],
  assumptions: ['EMS partner'], risks: [{ risk: 'SoC lead time', mitigation: 'Order early' }],
  sources: [{ title: 'BIS', url: 'https://bis.gov.in' }],
})
const pct = est.percentages
const P = productReport({ req, map, answers, est, pct, warnings: ['Thread: rates re-ordered'], version: '0.10.0', date: '19 Nov 2026' })
const titles = (m) => m.sections.map((s) => s.title)
const pdfText = (bytes, name) => {
  const f = `/tmp/${name}.pdf`
  writeFileSync(f, bytes)
  return { text: execFileSync('pdftotext', ['-layout', f, '-']).toString(), info: execFileSync('pdfinfo', [f]).toString() }
}

// FR-015-02 FR-015-04 FR-015-09 AC-1
describe('product report content', () => {
  it('has every non-empty section, in order', () => {
    expect(titles(P)).toEqual(['Summary', 'Request and understanding', 'Requirements and answers', 'Raw materials', 'Options', 'Bill of materials', 'Wastage by cause', 'Sourcing and prices',
      'Labour', 'One-time costs', 'Per-unit costs', 'Cost sheet', 'Quantity breakdowns', 'Process', 'Compliance', 'Timeline', 'Risks', 'Assumptions', 'Engine checks', 'Sources', 'Method and disclaimer'])
  })
  it('uses the same code totals as the screen', () => {
    const t = calculate(est, 5000, pct)
    expect(P.totals.likely).toBe(t.likely.total)
    expect(P.totals.low).toBe(t.low.total)
    expect(P.totals.high).toBe(t.high.total)
  })
  it('lists every requirement with its answer and marks expert defaults', () => {
    const rows = P.sections.find((s) => s.title === 'Requirements and answers').blocks.find((b) => b.type === 'table').rows
    expect(rows.map((r) => r.slice(1, 3))).toEqual([['Which segment?', 'Mid 5G'], ['How many phones?', '5,000 units'], ['Anything else?', '—']])
    expect(rows[0][3]).toBe('')
    expect(P.sections.find((s) => s.title === 'Requirements and answers').blocks.find((b) => b.type === 'table').rows.some((r) => r[3] === 'Expert default')).toBe(false)
  })
  it('leaves out empty sections', () => {
    const p2 = productReport({ req, map, answers, est: normaliseEstimate({ bom: est.bom }), pct, warnings: [], version: 'x', date: 'd' })
    expect(titles(p2)).not.toContain('Risks')
    expect(titles(p2)).not.toContain('Engine checks')
  })
})

// FR-015-03 FR-015-04 AC-2
describe('building report content', () => {
  const a = withDefaults({ project_type: 'warehouse', length: 80, width: 40 }, { project_type: true, length: true, width: true })
  const r = compute(a, DEFAULT_RATES)
  const B = buildingReport({ a, r, rates: DEFAULT_RATES, version: '0.10.0', date: '19 Nov 2026' })
  it('has every section', () => {
    for (const t of ['Summary', 'Inputs', 'Raw materials', 'Geometry', 'Steel schedule', 'Cutting and wastage', 'Welding', 'Concrete and rebar', 'Envelope and paint', 'Bill of quantities', 'Cost build-up', 'Rates used', 'Engineering checks', 'Method and disclaimer'])
      expect(titles(B)).toContain(t)
  })
  it('BOQ amounts sum to the direct cost, and the total matches', () => {
    expect(B.boqSum).toBeCloseTo(r.cost.direct, 2)
    expect(B.totals.total).toBe(r.cost.total)
    const checks = B.sections.find((s) => s.title === 'Engineering checks').blocks.flatMap((b) => b.items || [])
    expect(checks.some((c) => c.startsWith('Market check'))).toBe(true)
  })
})

// FR-015-05 AC-1: a real PDF with cover, contents, page numbers and ₹
describe('PDF', () => {
  it('product report PDF', async () => {
    const bytes = await renderPDF(P)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    const { text, info } = pdfText(bytes, 'product-report')
    const pages = Number(info.match(/Pages:\s+(\d+)/)[1])
    expect(pages).toBeGreaterThanOrEqual(4)
    expect(text).toMatch(/Contents/)
    expect(text).toMatch(new RegExp(`Page 1 of ${pages}`))
    expect(text).toContain('₹')
    for (const t of ['Bill of materials', 'Cost sheet', 'Requirements and answers', 'Method and disclaimer', 'Imported from Taiwan']) expect(text).toContain(t)
    expect(text).toContain(P.totalsText.likely) // the grand total, formatted
  })
  it('building report PDF', async () => {
    const a = withDefaults({ project_type: 'warehouse', length: 80, width: 40 }, { project_type: true, length: true, width: true })
    const r = compute(a, DEFAULT_RATES)
    const { text, info } = pdfText(await renderPDF(buildingReport({ a, r, rates: DEFAULT_RATES, version: 'v', date: 'd' })), 'building-report')
    expect(Number(info.match(/Pages:\s+(\d+)/)[1])).toBeGreaterThanOrEqual(6)
    for (const t of ['Steel schedule', 'Cutting and wastage', 'Welding', 'Bill of quantities', 'Market check', 'ISMB 350']) expect(text).toContain(t)
  })
})

// FR-015-06 AC-3: a valid workbook, one sheet per section, numbers as numbers, text never a formula
describe('Excel workbook', () => {
  it('is a valid xlsx', () => {
    const files = unzipSync(renderXLSX(P))
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) expect(files[f], f).toBeTruthy()
    const wb = strFromU8(files['xl/workbook.xml'])
    const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBe(P.sections.length)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31)
    const all = Object.entries(files).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => strFromU8(v)).join('')
    expect(all).not.toMatch(/<f>/)
    expect(all).toContain('=HYPERLINK') // as text
    const bomSheet = strFromU8(files[`xl/worksheets/sheet${names.indexOf('Bill of materials') + 1}.xml`])
    expect(bomSheet).toMatch(/<c r="[A-Z]+\d+" s="\d+"><v>3600<\/v><\/c>/) // the likely rate is a number cell
  })
})

// FR-015-07 AC-4: sourcing plan PDF with totals for the chosen quantity
describe('sourcing plan report', () => {
  it('totals for the chosen quantity, in a PDF', async () => {
    const plan = parseSourcing({ options: [{ name: 'Printed tees', unit_price: { low: 150, likely: 200, high: 260 }, customisation_per_unit: { likely: 30 }, delivery_total: { likely: 500 }, where: ['Tiruppur'] }], tips: ['Order 5% extra'] })
    const S = sourcingReport({ text: 'need t shirts for an event', plan, qty: 200, version: 'v', date: 'd' })
    const table = S.sections.find((s) => s.title === 'Options and totals').blocks.find((b) => b.type === 'table')
    expect(table.rows[0].some((c) => c && c.v === 200 * 200 + 30 * 200 + 500)).toBe(true)
    const { text } = pdfText(await renderPDF(S), 'sourcing')
    expect(text).toContain('Tiruppur')
    expect(text).toContain('46,500')
  })
})
