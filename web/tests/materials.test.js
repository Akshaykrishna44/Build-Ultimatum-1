import { it, expect } from 'vitest'
import { normaliseMaterials } from '../src/materials.js'
import { materialsFor } from '../src/domains/building/materials.js'
import { researchPrompt } from '../src/ai.js'
import { withDefaults } from '../src/domains/building/questions.js'

// FR-014-01: the research step asks for raw materials, India only
it('research prompt asks for raw materials with Indian sources', () => {
  const p = researchPrompt({ product: 'leather shoes', qty: 0, unit: 'pairs', location: '', currency: 'INR', notes: '' })
  expect(p).toMatch(/"raw_materials"/)
  expect(p).toMatch(/india_sources/)
  expect(p).toMatch(/imported/)
})

// FR-014-02
it('normalises the AI rows', () => {
  const rows = normaliseMaterials([
    { material: 'Cow leather', used_for: 'Upper', grades: ['Full grain', 'Corrected grain'], india_sources: ['Kanpur', 'Ambur–Vaniyambadi', 'Kolkata'], typical_price: '₹90–180 per sq ft', imported: false, origin: 'Italy' },
    { used_for: 'nothing' },
    { material: 'Shoe adhesive', grades: 'PU', india_sources: 'Chennai', imported: 'yes', origin: 'Germany' },
    ...Array.from({ length: 20 }, (_, i) => ({ material: 'm' + i })),
  ])
  expect(rows.length).toBe(14)
  expect(rows[0]).toEqual({ material: 'Cow leather', used_for: 'Upper', grades: ['Full grain', 'Corrected grain'], india_sources: ['Kanpur', 'Ambur–Vaniyambadi', 'Kolkata'], typical_price: '₹90–180 per sq ft', imported: false, origin: '' })
  expect(rows[1]).toMatchObject({ material: 'Shoe adhesive', grades: ['PU'], india_sources: ['Chennai'], imported: true, origin: 'Germany' })
  expect(normaliseMaterials(undefined)).toEqual([])
})

// FR-014-04 AC-2
it('PEB warehouse lists steel-structure materials and no bricks', () => {
  const a = withDefaults({ project_type: 'warehouse', system: 'peb', steel_grade: 'E250', wall_clad: 'sheet' }, { project_type: true, system: true, steel_grade: true, wall_clad: true })
  const names = materialsFor(a).map((m) => m.material).join(' | ')
  expect(names).toMatch(/Structural steel/)
  expect(materialsFor(a).find((m) => /Structural steel/.test(m.material)).grades.join(' ')).toMatch(/IS 2062 E250/)
  expect(names).toMatch(/Cold-formed/)
  expect(names).toMatch(/sheets/i)
  expect(names).toMatch(/Fasteners/)
  expect(names).toMatch(/Welding/)
  expect(names).not.toMatch(/brick/i)
  for (const m of materialsFor(a)) expect(m.india_sources.length).toBeGreaterThan(0)
  // the default brick dado wall does need bricks
  expect(materialsFor({ ...a, wall_clad: 'dado' }).map((m) => m.material).join(' ')).toMatch(/brick/i)
})

// FR-014-04 AC-3
it('RCC house lists cement, the chosen TMT grade and walling, no structural steel', () => {
  const a = withDefaults({ project_type: 'house', system: 'rcc', rebar_grade: 'Fe500D' }, { project_type: true, system: true, rebar_grade: true })
  const ms = materialsFor(a)
  const names = ms.map((m) => m.material).join(' | ')
  expect(names).toMatch(/Cement/)
  expect(ms.find((m) => /TMT/.test(m.material)).grades).toContain('Fe500D')
  expect(names).toMatch(/Walling/)
  expect(names).not.toMatch(/Structural steel/)
})
