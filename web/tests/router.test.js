import { describe, it, expect } from 'vitest'
import { route, parseQuantity } from '../src/router.js'
import cases from './fixtures/router_cases.json'

describe('spec 001: universal router', () => {
  it('FR-001-02 building keywords route to the building engine', () => {
    expect(route({ product: 'PEB warehouse 80 × 40 m', notes: '' }).engine).toBe('building')
    expect(route({ product: 'Independent house 2 floors', notes: '' }).engine).toBe('building')
  })

  it('FR-001-03 other requests go to the AI engine with whole-word, plural-aware domain packs', () => {
    const r = route({ product: '500 ICU ventilators', notes: '' })
    expect(r.engine).toBe('ai')
    expect(r.packs.map((p) => p.id)).toEqual(['medical'])
    expect(route({ product: 'api server for tasks', notes: '' }).packs).toEqual([])
  })

  it('FR-001-04 factory/plant without a structure word is ambiguous', () => {
    expect(route({ product: 'garment factory in Tiruppur', notes: '' }).ambiguous).toBe(true)
    expect(route({ product: 'garment factory building', notes: '' }).ambiguous).toBe(false)
  })

  it('FR-001-05 building pre-fill: type, class, dimensions, floors, crane rounded', () => {
    const p = route({ product: 'Medium-industry factory building 60 × 30 m with 10 t EOT crane', notes: '' }).prefill
    expect(p).toMatchObject({ project_type: 'industrial', industry_class: 'medium', length: 60, width: 30, crane: '10' })
    expect(route({ product: 'house 2 floors 10 x 15 m', notes: '' }).prefill).toMatchObject({ floors: 2, length: 15, width: 10 })
    expect(route({ product: 'factory building with 7 t crane', notes: '' }).prefill.crane).toBe('5')
  })

  it('FR-001-06 quantity parsing ignores sizes and specs', () => {
    expect(parseQuantity('500 ICU ventilators')).toEqual({ qty: 500, unit: 'units' })
    expect(parseQuantity('10,000 43-inch 4K LED TVs')).toEqual({ qty: 10000, unit: 'units' })
    expect(parseQuantity('2 lakh cotton T-shirts')).toEqual({ qty: 200000, unit: 'pieces' })
    expect(parseQuantity('1.5 crore bricks').qty).toBe(15000000)
    expect(parseQuantity('Organic paddy on 100 acres')).toEqual({ qty: 100, unit: 'acres' })
    expect(parseQuantity('200 5 kVA solar inverters').qty).toBe(200)
    expect(parseQuantity('PEB warehouse 80 × 40 m')).toBeNull()
    expect(parseQuantity('factory with 10 t crane')).toBeNull()
  })

  it('FR-001-07 JS router matches the shared case file (Python checks the same file)', () => {
    for (const c of cases) {
      const r = route({ product: c.product, notes: '' })
      expect({ engine: r.engine, ambiguous: r.ambiguous, packs: r.packs.map((p) => p.id), prefill: r.prefill }, c.product).toEqual(c.expect)
    }
  })
})
