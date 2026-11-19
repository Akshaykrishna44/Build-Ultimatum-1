import { describe, it, expect } from 'vitest'
import { compute } from '../src/domains/building/takeoff.js'
import { withDefaults } from '../src/domains/building/questions.js'
import { DEFAULT_RATES } from '../src/domains/building/rates.js'
import { SECTIONS } from '../src/domains/building/sections.js'

const run = (raw) => {
  const a = withDefaults(raw, Object.fromEntries(Object.keys(raw).map((k) => [k, true])))
  return { a, r: compute(a, DEFAULT_RATES) }
}

// FR-003-17 accuracy benchmark: section weights vs published IS 808:1989 / Indian mill tables (within 1 %)
describe('steel section weights match IS 808 / mill tables', () => {
  const published = {
    'ISMB 200': 25.4, 'ISMB 250': 37.3, 'ISMB 300': 46.0, 'ISMB 350': 52.4, 'ISMB 400': 61.6, 'ISMB 450': 72.4,
    'ISMB 500': 86.9, 'ISMB 600': 123.0, 'ISMC 150': 16.8, 'ISMC 200': 22.3, 'ISMC 250': 30.6, 'ISMC 300': 36.3, 'ISA 75×75×6': 6.8,
  }
  it.each(Object.entries(published))('%s ≈ %s kg/m', (name, kg) => {
    expect(Math.abs(SECTIONS[name].kg - kg) / kg).toBeLessThan(0.01)
  })
})

// FR-003-17 FR-003-11 FR-003-14 accuracy benchmark: quantities and costs vs published 2026 Indian data
describe('building engine vs published 2026 Indian benchmarks', () => {
  it.each([
    ['PEB warehouse 80×40', { project_type: 'warehouse', length: 80, width: 40 }],
    ['PEB factory, light 60×30', { project_type: 'industrial', industry_class: 'light', length: 60, width: 30 }],
    ['PEB factory, medium 60×30', { project_type: 'industrial', industry_class: 'medium', length: 60, width: 30 }],
    ['heavy factory 90×30', { project_type: 'industrial', industry_class: 'heavy', length: 90, width: 30 }],
    ['RCC house G+1 15×10', { project_type: 'house', length: 15, width: 10, floors: 2 }],
  ])('%s: estimate + excluded items is in line with the published turnkey range', (_, raw) => {
    const { r } = run(raw)
    const c = r.checks.find((x) => x.text.startsWith('Market check'))
    expect(c, 'market check present').toBeTruthy()
    expect(c.level).toBe('ok')
  })
  it('house steel ≈ 3.5–4 kg per sq ft (published: 7,000–8,000 kg for 2,000 sq ft)', () => {
    const { r } = run({ project_type: 'house', length: 15, width: 10, floors: 2 })
    const kgPerSqft = r.concrete.reduce((s, c) => s + c.rebarKg, 0) / (r.geom.builtUp * 10.7639)
    expect(kgPerSqft).toBeGreaterThan(3.0)
    expect(kgPerSqft).toBeLessThan(4.5)
  })
  it('a wildly wrong rate is flagged by the market check', () => {
    const a = withDefaults({ project_type: 'warehouse', length: 80, width: 40 }, { project_type: true, length: true, width: true })
    const rates = { ...DEFAULT_RATES, steel_rolled: { ...DEFAULT_RATES.steel_rolled, value: 620 } } // ₹620/kg typo
    const c = compute(a, rates).checks.find((x) => x.text.startsWith('Market check'))
    expect(c.level).toBe('warn')
  })
})
