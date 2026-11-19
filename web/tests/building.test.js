import { describe, it, expect } from 'vitest'
import { withDefaults, visibleStages } from '../src/domains/building/questions.js'
import { compute } from '../src/domains/building/takeoff.js'
import { DEFAULT_RATES } from '../src/domains/building/rates.js'
import { SECTIONS } from '../src/domains/building/sections.js'
import { optimiseCutting, cutWithPolicy } from '../src/domains/building/cutting.js'
import { filletKgPerM, buttKgPerM, weldingCalc } from '../src/domains/building/welding.js'

const medium = (extra = {}, touched = {}) =>
  withDefaults({ project_type: 'industrial', industry_class: 'medium', ...extra }, { project_type: true, industry_class: true, ...touched })

describe('spec 003: building engine', () => {
  it('FR-003-01 questions are conditional on classification', () => {
    const house = withDefaults({ project_type: 'house' }, { project_type: true })
    const ids = (a) => visibleStages(a).map((s) => s.id)
    expect(ids(house)).not.toContain('members')
    expect(ids(house)).toContain('rcc')
    expect(ids(medium())).toContain('welding')
    expect(visibleStages(house).flatMap((s) => s.questions).map((q) => q.id)).not.toContain('industry_class')
  })

  it('FR-003-02 defaults follow upstream answers unless the user touched them', () => {
    expect(medium().col_section).toBe('ISMB 450')
    expect(withDefaults({ project_type: 'industrial', industry_class: 'heavy' }, { project_type: true, industry_class: true }).col_section).toBe('ISMB 600')
    expect(medium({ col_section: 'ISMB 300' }, { col_section: true }).col_section).toBe('ISMB 300')
  })

  it('FR-003-03 member counts from geometry (hand calc 60 × 30, bay 7.5, 1 span)', () => {
    const r = compute(medium({ spans: 1, bay: 7.5 }, { spans: true, bay: true }), DEFAULT_RATES)
    expect(r.geom).toMatchObject({ nBays: 8, frames: 9, spans: 1 })
    const col = r.steel.members.find((m) => m.id === 'col')
    expect(col.pieces[0].qty).toBe(18)
    expect(r.steel.members.find((m) => m.id === 'raf').pieces[0].qty).toBe(9 * 1 * 2)
    expect(r.steel.braced).toBe(2)
  })

  it('FR-003-04 section weights: IS 808 nominal and computed cold-formed / rod', () => {
    expect(SECTIONS['ISMB 450'].kg).toBe(72.4)
    expect(SECTIONS['Z 200×60×2'].kg).toBeCloseTo(((200 + 120 + 40) * 2 * 7850) / 1e6, 2)
    expect(SECTIONS['Rod Ø20'].kg).toBeCloseTo((Math.PI * 400 * 7850) / 4 / 1e6, 2)
  })

  it('FR-003-05 cutting optimiser: FFD with kerf, splices and offcuts', () => {
    const r = optimiseCutting([{ mark: 'C', length: 8, qty: 10 }, { mark: 'R', length: 15.3, qty: 4 }], { stock: 12, kerf: 3, minReuse: 1 })
    expect(r.bars).toBe(18)
    expect(r.splices).toBe(4)
    expect(r.netM).toBeCloseTo(80 + 61.2, 6)
    const r2 = optimiseCutting([{ mark: 'P', length: 5.9, qty: 2 }], { stock: 12, kerf: 3 })
    expect(r2.bars).toBe(1) // 5.9 + 0.003 + 5.9 fits in 12
  })

  it('FR-003-06 stock policies: std > best > ctl loss; cold-formed roll-formed', () => {
    const loss = (p) => compute(medium({ stock_policy: p }, { stock_policy: true }), DEFAULT_RATES).steel.lossPct
    expect(loss('std')).toBeGreaterThan(loss('best'))
    expect(loss('best')).toBeGreaterThan(loss('ctl'))
    const z = compute(medium(), DEFAULT_RATES).steel.groups.find((g) => g.s.family === 'Z')
    expect(z.rollFormed).toBe(true)
    expect(z.cut.chargedLossPct).toBeLessThan(1)
  })

  it('FR-003-07 charged wastage = bought − net − reused share of reusable offcuts', () => {
    const pieces = [{ mark: 'C', length: 8, qty: 10 }]
    const a = cutWithPolicy(pieces, { policy: 'std', reuseShare: 0 })
    const b = cutWithPolicy(pieces, { policy: 'std', reuseShare: 0.5 })
    expect(a.chargedLossM).toBeCloseTo(a.boughtM - a.netM, 6)
    expect(b.chargedLossM).toBeCloseTo(b.boughtM - b.netM - 0.5 * b.reusableM, 6)
    const r = compute(medium(), DEFAULT_RATES).steel
    expect(r.platesBoughtKg).toBeCloseTo(r.platesNetKg * 1.08, 6)
  })

  it('FR-003-08 welding formulas', () => {
    expect(filletKgPerM(6)).toBeCloseTo(0.155, 3)
    expect(buttKgPerM(12)).toBeCloseTo((144 * Math.tan(Math.PI / 6) + 24) * 7850 * 1.1 / 1e6, 6)
    const w = weldingCalc({ filletM: 1000, buttM: 0 }, { process: 'smaw', filletSize: 6 })
    expect(w.consumable).toBeCloseTo(w.metal / 0.6, 6)
    expect(w.arcHr).toBeCloseTo(w.metal / 1.5, 6)
    expect(w.welderHr).toBeCloseTo(w.arcHr / 0.3, 6)
  })

  it('FR-003-09 weld length log adds up to the lengths used', () => {
    const w = compute(medium(), DEFAULT_RATES).welding
    const sum = w.log.reduce((t, l) => t + l.m, 0)
    expect(sum).toBeCloseTo(w.lengths.filletM + w.lengths.buttM, 6)
    expect(w.log.every((l) => l.formula)).toBe(true)
  })

  it('FR-003-10 concrete +2.5% and rebar +5% laps +3% cutting', () => {
    const c = compute(medium(), DEFAULT_RATES).concreteTotals
    expect(c.volWithWaste).toBeCloseTo(c.vol * 1.025, 6)
    expect(c.rebarWithWaste).toBeCloseTo(c.rebar * 1.08, 6)
  })

  it('FR-003-11 steel intensity check against class range', () => {
    const r = compute(medium(), DEFAULT_RATES)
    expect(r.steel.perM2).toBeGreaterThanOrEqual(30)
    expect(r.steel.perM2).toBeLessThanOrEqual(48)
    expect(r.checks.some((c) => c.level === 'ok' && c.text.includes('Steel intensity'))).toBe(true)
    const soft = compute(medium({ soil: 'soft', footing_type: 'isolated' }, { soil: true, footing_type: true }), DEFAULT_RATES)
    expect(soft.checks.some((c) => c.text.includes('Soft soil'))).toBe(true)
  })

  it('FR-003-12 cost sheet chain', () => {
    const { cost, boq, geom } = compute(medium(), DEFAULT_RATES)
    expect(cost.direct).toBeCloseTo(boq.reduce((t, r) => t + r.amount, 0), 4)
    expect(cost.total).toBeCloseTo(cost.cost + cost.margin + cost.gst, 4)
    expect(cost.perM2).toBeCloseTo(cost.total / geom.builtUp, 4)
  })

  it('FR-003-13 editing a rate recalculates', () => {
    const a = medium()
    const base = compute(a, DEFAULT_RATES).cost.total
    const rates = { ...DEFAULT_RATES, steel_rolled: { ...DEFAULT_RATES.steel_rolled, value: DEFAULT_RATES.steel_rolled.value * 2 } }
    expect(compute(a, rates).cost.total).toBeGreaterThan(base)
  })

  it('FR-003-14 disclaimers: preset sections, scope exclusions, placeholder rates', () => {
    const r = compute(medium(), DEFAULT_RATES)
    expect(r.checks.some((c) => c.text.includes('not a structural design'))).toBe(true)
    expect(r.checks.some((c) => c.text.startsWith('Excludes'))).toBe(true)
    const house = compute(withDefaults({ project_type: 'house' }, { project_type: true }), DEFAULT_RATES)
    expect(house.checks.some((c) => c.text.includes('Covers structure'))).toBe(true)
  })
})
