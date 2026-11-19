import { describe, it, expect } from 'vitest'
import { parseJSON } from '../src/ai.js'
import CASES from './fixtures/ai_output_formats.json'

// Bug sweep 2026-11-19: real model output comes in many shapes; the same cases run in engine/tests/test_aiformats.py
describe('reading real AI output formats', () => {
  it.each(CASES.map((c) => [c.name, c]))('%s', (_, c) => {
    if (c.error) return expect(() => parseJSON(c.text)).toThrow(/structured data/)
    const v = parseJSON(c.text)
    for (const [k, want] of Object.entries(c.expect)) expect(v[k]).toEqual(want)
    for (const [k, n] of Object.entries(c.expect_len || {})) expect(v[k].length).toBe(n)
    expect(!!v.__truncated).toBe(/truncated/.test(c.name))
  })
})
