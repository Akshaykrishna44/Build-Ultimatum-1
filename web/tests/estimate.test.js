import { describe, it, expect } from 'vitest'
import { normaliseEstimate, normaliseMap, sanitiseEstimate } from '../src/estimate.js'
import { calculate } from '../src/calc.js'

// FR-002-17: messy AI estimates are cleaned in code
describe('normaliseEstimate', () => {
  const messy = {
    product_title: 7,
    options_catalog: [{ category: 'Fabric' }, { category: 'Print', options: ['x', { name: 'Screen' }] }, null],
    breakdowns: [{ title: 'Sizes' }, { title: 'Colours', rows: [{ label: 'Black', share_pct: '60' }, { label: 'White', share_pct: 140 }] }],
    bom: [
      { component: 'Fabric', consumption_per_unit: '0.25', wastage_pct: 150, rate_low: 400, rate_likely: 300, rate_high: 200 },
      { material: 'Thread', consumption_per_unit: -2, rate_likely: '1,200' },
      { note: 'no name' },
      'junk',
    ],
    labour: { skill: 'not a list' },
    per_unit_costs: { packaging: '5', logistics: -3, utilities: 'abc' },
    percentages: { overhead_pct: 250, tax_pct: '18' },
    market_price: { likely: 300 },
    compliance: ['BIS', { code: 'x' }, null],
    risks: [{ risk: 'Delay' }, { mitigation: 'orphan' }],
  }
  const e = normaliseEstimate(messy)
  it('keeps every list a list and drops nameless rows', () => {
    expect(e.options_catalog.map((c) => c.category)).toEqual(['Print'])
    expect(e.options_catalog[0].options.map((o) => o.name)).toEqual(['Screen'])
    expect(e.breakdowns.map((b) => b.title)).toEqual(['Colours'])
    expect(e.bom.map((b) => b.component)).toEqual(['Fabric', 'Thread'])
    expect(e.labour).toEqual([])
    expect(e.risks).toEqual([{ risk: 'Delay', mitigation: '' }])
    expect(e.product_title).toBe('7')
  })
  it('orders rates, clamps numbers and percentages', () => {
    expect([e.bom[0].rate_low, e.bom[0].rate_likely, e.bom[0].rate_high]).toEqual([400, 300, 200]) // sorted by sanitiseEstimate
    expect(e.bom[0].wastage_pct).toBe(150) // raw; sanitiseEstimate clamps it (FR-002-08)
    expect(e.bom[0].consumption_per_unit).toBe(0.25)
    expect(e.bom[1].consumption_per_unit).toBe(0)
    expect([e.bom[1].rate_low, e.bom[1].rate_likely, e.bom[1].rate_high]).toEqual([1200, 1200, 1200])
    expect(e.per_unit_costs).toEqual({ packaging: 5, logistics: 0, utilities: 0 })
    expect(e.percentages).toEqual({ overhead_pct: 100, contingency_pct: 0, margin_pct: 0, tax_pct: 18 })
    expect(e.breakdowns[0].rows[1].share_pct).toBe(100)
    expect(e.market_price).toMatchObject({ low: 300, likely: 300, high: 300 })
  })
  it('gives low ≤ likely ≤ high totals', () => {
    const t = calculate(sanitiseEstimate(e).est, 100, e.percentages)
    expect(t.low.total).toBeLessThanOrEqual(t.likely.total)
    expect(t.likely.total).toBeLessThanOrEqual(t.high.total)
  })
  it('survives null and garbage', () => {
    expect(normaliseEstimate(null).bom).toEqual([])
    expect(normaliseEstimate('text').options_catalog).toEqual([])
  })
})

// FR-002-17: messy AI interview maps render safely
describe('normaliseMap', () => {
  const m = normaliseMap({
    domain: 'Apparel',
    stages: [
      { title: 'Fabric', questions: [
        { id: 'fab', q: 'Which fabric?', type: 'single', options: ['Combed cotton', 'Polyester'], default: 'Polyester' },
        { id: 'cols', q: 'Colours?', type: 'multi', options: [{ value: 'black', label: 'Black' }], default: 'black' },
        { id: 'gsm', q: 'GSM?', type: 'number', default: '180' },
        { id: 'odd', q: 'Odd?', type: 'slider' },
        { id: 'noopt', q: 'Pick', type: 'single', options: [] },
        { q: '' },
      ] },
      { title: 'Empty stage' },
      null,
    ],
  })
  it('turns plain-word options into buttons and fixes types and defaults', () => {
    const [fab, cols, gsm, odd, noopt] = m.stages[0].questions
    expect(fab.options).toEqual([{ value: 'combed_cotton', label: 'Combed cotton', note: '' }, { value: 'polyester', label: 'Polyester', note: '' }])
    expect(fab.default).toBe('polyester')
    expect(cols.default).toEqual(['black'])
    expect(gsm.default).toBe(180)
    expect(odd.type).toBe('text')
    expect(noopt.type).toBe('text')
    expect(m.stages[0].questions.length).toBe(5)
  })
  it('gives every stage an id and a questions list', () => {
    expect(m.stages.map((s) => [s.id, s.questions.length])).toEqual([['s1', 5], ['s2', 0]])
  })
})

// FR-002-08: the web now sanitises exactly like the Python engine (wastage 0–60 %, shares to 100 %, warnings)
describe('sanitiseEstimate', () => {
  it('matches the Python engine rules', () => {
    const { est, warnings } = sanitiseEstimate(normaliseEstimate({
      bom: [{ component: 'Housing', wastage_pct: 300, rate_low: 100, rate_likely: 50, rate_high: 80 }],
      breakdowns: [{ title: 'Mix', rows: [{ label: 'A', share_pct: 30 }, { label: 'B', share_pct: 30 }] }],
    }))
    expect(est.bom[0].wastage_pct).toBe(60)
    expect([est.bom[0].rate_low, est.bom[0].rate_likely, est.bom[0].rate_high]).toEqual([50, 80, 100])
    expect(est.breakdowns[0].rows.map((r) => r.share_pct)).toEqual([50, 50])
    expect(warnings.length).toBe(3) // wastage, rates, shares — same as the Python test
  })
})

// Bug sweep: CSV cells that would run as Excel formulas are escaped; numbers are untouched
it('escapes formula-like CSV text', async () => {
  const { csvCell } = await import('../src/export.js')
  expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
  expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  expect(csvCell(-5)).toBe('-5')
  expect(csvCell('Cotton, combed')).toBe('"Cotton, combed"')
})

// Security: only http(s) source links are rendered
it('drops javascript: and data: links', async () => {
  const { safeUrl } = await import('../src/estimate.js')
  expect(safeUrl('javascript:alert(1)')).toBe('')
  expect(safeUrl(' JaVaScRiPt:alert(1)')).toBe('')
  expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  expect(safeUrl('https://bis.gov.in/x')).toBe('https://bis.gov.in/x')
  const e = normaliseEstimate({ bom: [{ component: 'x' }], sources: [{ url: 'javascript:alert(1)', title: 'bad' }, { url: 'https://ok.in', title: 'ok' }] })
  expect(e.sources).toEqual([{ url: 'https://ok.in/', title: 'ok' }])
})
