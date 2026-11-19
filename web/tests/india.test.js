import { it, expect } from 'vitest'
import { ensureQty, reqWithQty } from '../src/engine.js'
import { researchPrompt, estimatePrompt, followupsPrompt, expertContext } from '../src/ai.js'
import { understandPrompt, advisePrompt, sourcingPrompt } from '../src/understand.js'
import PACKS from '../src/domainPacks.json'

const map = () => ({ stages: [{ id: 's1', title: 'Quantity & timeline', questions: [] }, { id: 's2', title: 'Market & purpose', questions: [] }] })
const req = { product: 'T-shirts', qty: 200, unit: 'pcs', location: '', currency: 'USD', notes: '' }

// FR-013-01 FR-013-02 AC-1
it('asks for an Indian state or city, never a currency', () => {
  const qs = ensureQty(map(), req).stages.flatMap((s) => s.questions)
  expect(qs.find((q) => q.id === 'currency')).toBeUndefined()
  const loc = qs.find((q) => q.id === 'market_location')
  expect(loc.q).toBe('Which state or city in India?')
  expect(loc.default).toBe('Tamil Nadu')
})

// FR-013-01 FR-013-02 AC-2
it('always prices in INR and stores an Indian location', () => {
  const r = reqWithQty(req, map(), { currency: 'USD', market_location: 'Coimbatore' })
  expect(r.currency).toBe('INR')
  expect(r.location).toBe('Coimbatore, India')
  expect(reqWithQty(req, map(), { market_location: 'Pune, Maharashtra, India' }).location).toBe('Pune, Maharashtra, India')
  expect(reqWithQty(req, map(), {}).location).toBe('Tamil Nadu, India')
})

// FR-013-03 AC-3
it('every prompt says India only, GST, and never asks for a country', () => {
  const m = { ...map(), domain: 'Apparel', product_title: 'T-shirts' }
  m.stages[0].questions = [{ id: 'q1', q: 'Fabric?', type: 'text' }]
  const r = { ...req, currency: 'INR', location: 'Tamil Nadu, India' }
  const prompts = [
    researchPrompt(r), estimatePrompt(r, m, {}), followupsPrompt(r, m, {}, m.stages[0]), expertContext(r, m, {}, ''),
    understandPrompt('t shirts'), advisePrompt('t shirts', ''), sourcingPrompt('t shirts', '', 200),
  ]
  for (const p of prompts) {
    expect(p).toMatch(/India only/)
    expect(p).toMatch(/GST/)
    expect(p).not.toMatch(/or country|state or country|\/ country/i)
    expect(p).not.toMatch(/USD/)
  }
})

// FR-013-04 AC-4
it('domain packs name only Indian regulation', () => {
  const text = JSON.stringify(PACKS)
  for (const w of ['FDA', 'CE under', 'EU MDR', 'REACH', 'OEKO', 'Export compliance', 'Export:']) expect(text).not.toContain(w)
})

// FR-013-03: India first; outsource abroad only when nothing is found in India (AK, 2026-11-18)
it('tells the AI to outsource only when nothing is found in India', () => {
  const p = sourcingPrompt('ventilator turbine', '', 100)
  expect(p).toMatch(/Source from India first/)
  expect(p).toMatch(/nothing suitable is found in India/)
  expect(p).toMatch(/country of origin/)
  expect(p).toMatch(/customs duty/)
})
