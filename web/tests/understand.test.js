import { describe, it, expect } from 'vitest'
import { isMeaningless, parseUnderstanding, quantityFrom, clarifiedNotes, PATHS, isClearManufacture } from '../src/understand.js'
import { sourcingTotals, parseSourcing, buildTarget } from '../src/understand.js'
import { matchPacks } from '../src/ai.js'

// FR-012-02 AC-1: clearly meaningless input is rejected locally, with no AI call
describe('local meaningless-input check', () => {
  it.each(['asdkj', 'hmm', 'xxxx', 'qwerty', 'zxcvb', 'jkl', 'a', '12', '   ', '!!!', 'sdfg hjkl', 'aaaaaaa', 'qwer asdf'])('rejects %j', (t) => {
    expect(isMeaningless(t).meaningless).toBe(true)
  })
  it.each([
    'need t shirts for an event',
    '500 ICU ventilators',
    'PEB warehouse 80 × 40 m',
    'which fabric is best for summer t-shirts?',
    'tea',
    'were can i buy rice',
    'rice',
    'शर्ट चाहिए', // non-Latin scripts are never judged by the Latin rules
    'சட்டை வேண்டும்',
    'gym',
    'solar plant 5 MW',
  ])('accepts %j', (t) => {
    expect(isMeaningless(t).meaningless).toBe(false)
  })
})

// FR-012-03: the AI's understanding is normalised into a safe shape
describe('parseUnderstanding', () => {
  it('keeps valid fields, limits questions to 3 and fills default paths', () => {
    const u = parseUnderstanding({
      intent: 'buy_source',
      summary: 'Custom T-shirts for an event.',
      questions: [
        { id: 'qty', q: 'How many?', options: ['50', '100', '200'] },
        { q: 'By when?', options: ['1 week', '2 weeks'] },
        { id: 'print', q: 'Printed?', options: ['Plain', 'Printed logo'] },
        { id: 'budget', q: 'Budget?', options: [] },
      ],
    })
    expect(u.intent).toBe('buy_source')
    expect(u.questions).toHaveLength(3)
    expect(u.questions[1].id).toBe('by_when')
    expect(u.paths.map((p) => p.id)).toEqual(['buy', 'make'])
  })
  it('turns an unknown intent into unclear and drops unknown paths', () => {
    expect(parseUnderstanding({ intent: 'dance', summary: '' }).intent).toBe('unclear')
    // FR-012-11: an unknown intent with a usable path is inferred from the path
    const u = parseUnderstanding({ intent: 'dance', summary: '', paths: ['fly', 'build'] })
    expect(u.intent).toBe('build_construct')
    expect(u.paths.map((p) => p.id)).toEqual(['build'])
    const v = parseUnderstanding({ intent: 'build_construct', summary: 'A house', paths: ['fly', 'build'] })
    expect(v.paths.map((p) => p.id)).toEqual(['build'])
  })
  it('keeps the direct answer for a question and offers follow-up paths', () => {
    const u = parseUnderstanding({ intent: 'question', summary: 'Best summer fabric', answer: 'Combed cotton 160–180 GSM…', paths: [{ id: 'buy', label: 'Turn this into a sourcing plan' }] })
    expect(u.answer).toMatch(/cotton/)
    expect(u.paths[0]).toEqual({ id: 'buy', label: 'Turn this into a sourcing plan' })
  })
  it('has the four path labels from the spec', () => {
    expect(PATHS.map((p) => p.label)).toEqual(['Buy / source it', 'Manufacture it', 'Build it', 'Just advise me'])
  })
})

// FR-012-04: answers carry into the next engine
describe('clarified answers', () => {
  const u = { summary: 'Custom T-shirts for an event.', questions: [{ id: 'qty', q: 'How many do you need?', options: [] }, { id: 'date', q: 'By when?', options: [] }] }
  it('finds the quantity from the quantity question, else from the request', () => {
    expect(quantityFrom('need t shirts for an event', u, { qty: '200' })).toBe(200)
    expect(quantityFrom('200 t shirts for an event', u, {})).toBe(200)
    expect(quantityFrom('need t shirts for an event', u, {})).toBe(0)
  })
  it('writes the answers as notes for the next engine', () => {
    expect(clarifiedNotes(u, { qty: '200', date: 'in 2 weeks' })).toBe('Custom T-shirts for an event. How many do you need? 200. By when? in 2 weeks.')
  })
})

// FR-012-06 AC-4: sourcing totals are computed in code, total = unit × qty (+ customisation × qty + delivery)
describe('sourcing plan', () => {
  const plan = parseSourcing({
    currency: 'INR',
    options: [
      { name: 'Custom-printed', unit_price: { low: 150, likely: 200, high: 260 }, customisation_per_unit: { low: 20, likely: 30, high: 45 }, delivery_total: { low: 0, likely: 500, high: 1000 }, moq: '50', lead_time: '7–10 days', where: ['Tiruppur'], total: 999999 },
      { name: 'Ready-made plain', unit_price: { low: 120, likely: 150, high: 180 } },
    ],
    tips: ['Order 5% extra'],
  })
  it('ignores any total the AI wrote and computes it', () => {
    const t = sourcingTotals(plan.options[0], 200)
    expect(t.likely.unit).toBe(200)
    expect(t.likely.total).toBe(200 * 200 + 30 * 200 + 500)
    expect(t.low.total).toBe(150 * 200 + 20 * 200 + 0)
    expect(t.high.total).toBe(260 * 200 + 45 * 200 + 1000)
    expect(t.likely.perUnit).toBeCloseTo((200 * 200 + 30 * 200 + 500) / 200)
  })
  it('treats missing customisation and delivery as zero', () => {
    const t = sourcingTotals(plan.options[1], 200)
    expect(t.likely.total).toBe(150 * 200)
  })
  it('orders low ≤ likely ≤ high even if the AI swapped them', () => {
    const p = parseSourcing({ options: [{ name: 'x', unit_price: { low: 300, likely: 200, high: 100 } }] })
    expect(p.options[0].unit_price).toEqual({ low: 100, likely: 200, high: 300 })
  })
})

// FR-012-11 AC-6: intent is read robustly; real requests are never "didn't understand"
describe('robust intent reading', () => {
  it.each([
    [{ intent: 'manufacture', summary: 'Make mobile phones.' }, 'make_manufacture'],
    [{ intent: 'Make_Manufacture' }, 'make_manufacture'],
    [{ intent: 'make' }, 'make_manufacture'],
    [{ intent: 'buy' }, 'buy_source'],
    [{ intent: 'sourcing' }, 'buy_source'],
    [{ intent: 'construct' }, 'build_construct'],
    [{ intent: 'cost estimate' }, 'estimate_cost'],
    [{ understanding: { intent: 'make_manufacture', summary: 's' } }, 'make_manufacture'],
    [{ intent: 'something odd', summary: 'Make phones', paths: ['make'] }, 'make_manufacture'],
    [{ intent: 'something odd', summary: 'A temple', paths: ['build'] }, 'build_construct'],
  ])('%j → %s', (raw, want) => {
    expect(parseUnderstanding(raw).intent).toBe(want)
  })
  it('overrides an AI "unclear" when the request has an action or domain word', () => {
    expect(parseUnderstanding({ intent: 'unclear' }, 'mobile manufacturing').intent).toBe('plan_project')
    expect(parseUnderstanding({ intent: 'unclear' }, 'mobile manufacturing').paths.map((p) => p.id)).toEqual(['buy', 'make', 'build', 'advise'])
    expect(parseUnderstanding({ intent: 'unclear' }, 'need LED bulbs').intent).toBe('plan_project')
    expect(parseUnderstanding({ intent: 'unclear' }, 'smartphone').intent).toBe('plan_project')
    expect(parseUnderstanding({ intent: 'unclear', reason: 'A name' }, 'Ramesh Kumar').intent).toBe('unclear')
  })
})

// FR-012-12 AC-7: the Build path picks the engine by building type
describe('build engine choice', () => {
  it('uses the building engine only for supported types', () => {
    expect(buildTarget('PEB warehouse 80 × 40 m', {})).toEqual({ engine: 'building', prefill: expect.objectContaining({ project_type: 'warehouse' }) })
    expect(buildTarget('i have planned to build a hindu temple', { building_type: 'other' }).engine).toBe('ai')
    expect(buildTarget('i have planned to build a hindu temple', {}).engine).toBe('ai')
    expect(buildTarget('build my house', { building_type: 'house' }).prefill.project_type).toBe('house')
    expect(buildTarget('a new shed for my unit', { building_type: 'industrial' }).prefill.project_type).toBe('industrial')
    expect(buildTarget('construct a church in Kerala', { building_type: 'other' }).engine).toBe('ai')
    expect(buildTarget('school', { building_type: 'commercial' }).engine).toBe('building')
  })
  it('the temple request gets the construction pack', () => {
    expect(matchPacks({ product: 'i have planned to build a hindu temple', notes: '' }).map((p) => p.id)).toContain('construction')
    expect(matchPacks({ product: 'mobile manufacturing', notes: '' }).map((p) => p.id)).toContain('electronics')
  })
})

// FR-012-13: plain manufacturing requests skip the understanding step (no AI call)
describe('clear manufacturing requests', () => {
  it.each(['mobile manufacturing', 'manufacture 500 ventilators', 'I want to make leather shoes', 'production of LED bulbs', 'need to fabricate steel doors', 'assemble e-bikes'])('%s → straight to interview', (t) => {
    expect(isClearManufacture(t)).toBe(true)
  })
  it.each(['buy or make t shirts', 'need t shirts for an event', 'how to make soap?', 'what is the cost to manufacture shoes?', 'should I manufacture or import?', 'supplier for mobile manufacturing parts', 'hindu temple'])('%s → understanding step', (t) => {
    expect(isClearManufacture(t)).toBe(false)
  })
})

// FR-012-08: questions are recognised
it('recognises questions', async () => {
  const { isQuestion } = await import('../src/understand.js')
  expect(isQuestion('which cement is best for a house?')).toBe(true)
  expect(isQuestion('how to build a warehouse')).toBe(true)
  expect(isQuestion('PEB warehouse 80 × 40 m')).toBe(false)
  expect(isQuestion('build a house 2 floors')).toBe(false)
})
