import { describe, it, expect } from 'vitest'
import { calculate, grossQty, wasteByReason } from '../src/calc.js'

describe('spec 002: calculation core', () => {
  it('FR-002-09 deterministic chain, same hand-calc as Python test_calculate_chain', () => {
    const est = { bom: [{ component: 'A', consumption_per_unit: 1, wastage_pct: 0, rate_low: 10, rate_likely: 10, rate_high: 10 }] }
    const t = calculate(est, 100, { overhead_pct: 10, contingency_pct: 0, margin_pct: 0, tax_pct: 0 })
    expect(t.likely.material).toBe(1000)
    expect(t.likely.total).toBeCloseTo(1100)
    expect(grossQty({ consumption_per_unit: 2, wastage_pct: 12 }, 50000)).toBeCloseTo(100000 / 0.88)
  })

  it('FR-002-09 full chain order: OH on direct, contingency on direct+OH, tax on cost+margin', () => {
    const est = { bom: [{ consumption_per_unit: 1, wastage_pct: 0, rate_low: 100, rate_likely: 100, rate_high: 100 }], labour: [{ minutes_per_unit: 60, rate_per_hour: 50 }], per_unit_costs: { packaging: 10 } }
    const L = calculate(est, 10, { overhead_pct: 10, contingency_pct: 10, margin_pct: 10, tax_pct: 10 }).likely
    // direct = 1000 + 500 + 100 = 1600; OH 160; cont 176; cost 1936; margin 193.6; tax 212.96; total 2342.56
    expect(L.direct).toBe(1600)
    expect(L.total).toBeCloseTo(2342.56, 2)
  })

  it('FR-002-14 wastage grouped by cause and sorted by value', () => {
    const est = { bom: [
      { component: 'PCB', consumption_per_unit: 1, wastage_pct: 2, wastage_reason: 'SMT attrition', rate_likely: 1000 },
      { component: 'Housing', consumption_per_unit: 1, wastage_pct: 10, wastage_reason: 'moulding runner', rate_likely: 500 },
    ] }
    const w = wasteByReason(est, 100)
    expect(w.byReason[0][0]).toBe('moulding runner')
    expect(w.byReason[0][1]).toBeCloseTo((100 / 0.9 - 100) * 500)
  })
})
