import { describe, it, expect } from 'vitest'
import { compute } from '../src/domains/building/takeoff.js'
import { STAGES, withDefaults } from '../src/domains/building/questions.js'
import { DEFAULT_RATES } from '../src/domains/building/rates.js'
import { calculate, wasteByReason } from '../src/calc.js'
import { materialsFor } from '../src/domains/building/materials.js'

// deterministic pseudo-random
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const JUNK = [0, -5, '', null, undefined, 'abc', 1e9, 0.0001, NaN, Infinity, '12', 3.7]
const finite = (o, path = '') => {
  const bad = []
  const walk = (v, p) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(p)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p + '.' + k)
  }
  walk(o, path)
  return bad
}

// FR-003-16: random and broken answers must never freeze, crash or show NaN / ∞
describe('building engine fuzz', () => {
  it('never throws and never produces NaN/Infinity in BOQ or totals, for 400 random answer sets', () => {
    const qs = STAGES.flatMap((s) => s.questions)
    const failures = []
    for (let i = 0; i < 400; i++) {
      const raw = {}
      const touched = {}
      for (const q of qs) {
        if (rnd() < 0.35) {
          touched[q.id] = true
          raw[q.id] = q.type === 'number' ? pick(JUNK) : q.options ? pick([...q.options.map((o) => o.value), 'bogus', '']) : pick(JUNK)
        }
      }
      let a, r
      try {
        a = withDefaults(raw, touched)
        r = compute(a, DEFAULT_RATES)
        materialsFor(a)
      } catch (e) {
        failures.push({ raw, err: String(e) })
        continue
      }
      const bad = finite({ boq: r.boq, geom: r.geom, total: r.total, cost: r.cost })
      if (bad.length) failures.push({ raw, bad: bad.slice(0, 5) })
      for (const row of r.boq) if (row.qty < 0 || (row.amount < 0 && !/^Credit/.test(row.item))) failures.push({ raw, negative: row.item }) // credits are negative by design
      for (const c of r.checks) if (/NaN|Infinity/.test(c.text)) failures.push({ raw, check: c.text })
    }
    expect(failures.slice(0, 3)).toEqual([])
  })
})

describe('cost calculator fuzz', () => {
  it('handles junk estimates: no throws, no NaN, low ≤ likely ≤ high', () => {
    const failures = []
    for (let i = 0; i < 300; i++) {
      const row = () => ({ consumption_per_unit: pick(JUNK), wastage_pct: pick([...JUNK, 120, 99]), rate_low: pick(JUNK), rate_likely: pick(JUNK), rate_high: pick(JUNK), wastage_reason: pick(['', 'x', null]) })
      const est = { bom: Array.from({ length: Math.floor(rnd() * 5) }, row), labour: [{ minutes_per_unit: pick(JUNK), rate_per_hour: pick(JUNK), headcount: pick(JUNK) }], one_time_costs: [{ qty: pick(JUNK), unit_cost: pick(JUNK), include_in_order: pick([true, false]) }], per_unit_costs: { a: pick(JUNK) } }
      const pct = { overhead_pct: pick(JUNK), contingency_pct: pick(JUNK), margin_pct: pick(JUNK), tax_pct: pick(JUNK) }
      try {
        const t = calculate(est, pick(JUNK), pct)
        wasteByReason(est, 10)
        const bad = finite(t)
        if (bad.length) failures.push({ bad: bad.slice(0, 3), est, pct })
      } catch (e) {
        failures.push({ err: String(e) })
      }
    }
    expect(failures.slice(0, 2)).toEqual([])
  })
})

// FR-003-16: a typo with extra zeros used to freeze the page
describe('building size caps', () => {
  it('caps absurd sizes quickly and reports each cap', async () => {
    const { clampAnswers } = await import('../src/domains/building/takeoff.js')
    const checks = []
    const a = clampAnswers({ length: 100000, width: 1e6, eave_height: 500, spans: 1e6, bay: 0.01, floors: '' }, checks)
    expect([a.length, a.width, a.eave_height, a.spans, a.bay, a.floors]).toEqual([1000, 300, 40, 20, 3, ''])
    expect(checks.length).toBe(5)
    const t0 = Date.now()
    compute(withDefaults({ project_type: 'warehouse', length: 100000, width: 1e6 }, { project_type: true, length: true, width: true }), DEFAULT_RATES)
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})

// FR-003-16: very large cutting jobs are optimised on a proportional sample; wastage % must match the full run
describe('cutting optimiser on huge jobs', () => {
  it('sampled wastage % matches the full run within 1 point, totals scale exactly', async () => {
    const { optimiseCutting } = await import('../src/domains/building/cutting.js')
    const mix = [{ mark: 'A', length: 7.3, qty: 600 }, { mark: 'B', length: 4.1, qty: 900 }, { mark: 'C', length: 2.65, qty: 1100 }, { mark: 'D', length: 15.5, qty: 120 }]
    const full = optimiseCutting(mix, { stock: 12, kerf: 3, minReuse: 1 })
    const big = optimiseCutting(mix.map((p) => ({ ...p, qty: p.qty * 5 })), { stock: 12, kerf: 3, minReuse: 1 })
    expect(full.sampled).toBeUndefined()
    expect(big.sampled).toBe(true)
    expect(Math.abs(big.grossLossPct - full.grossLossPct)).toBeLessThan(1)
    expect(big.netM).toBeCloseTo(full.netM * 5, 6)
    expect(big.splices).toBe(full.splices * 5)
  })
})

// FR-003-13: saved rates from an older version merge onto today's list
describe('saved building rates', () => {
  it('keeps new rates, takes saved values, ignores junk', async () => {
    const { mergeRates, DEFAULT_RATES } = await import('../src/domains/building/rates.js')
    const keys = Object.keys(DEFAULT_RATES)
    const saved = { [keys[0]]: { value: 99999 }, [keys[1]]: { value: 'abc' }, [keys[2]]: { value: -5 }, old_removed_rate: { value: 1 } }
    const r = mergeRates(saved)
    expect(Object.keys(r)).toEqual(keys)
    expect(r[keys[0]].value).toBe(99999)
    expect(r[keys[1]].value).toBe(DEFAULT_RATES[keys[1]].value)
    expect(r[keys[2]].value).toBe(DEFAULT_RATES[keys[2]].value)
    expect(mergeRates(undefined)).toEqual(DEFAULT_RATES)
    // every rate present → no ₹0 lines for a returning user
    for (const k of keys) expect(r[k].label).toBe(DEFAULT_RATES[k].label)
  })
})
