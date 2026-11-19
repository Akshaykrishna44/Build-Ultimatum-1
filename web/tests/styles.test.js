import { it, expect } from 'vitest'
import fs from 'node:fs'

// Guards against a broken stylesheet silently disabling the desktop layout (bug in v0.5.5).
it('styles.css has balanced braces and every @media block closes', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  let depth = 0
  for (const ch of css) {
    if (ch === '{') depth++
    if (ch === '}') depth--
    expect(depth).toBeGreaterThanOrEqual(0)
  }
  expect(depth).toBe(0)
  // a @media block must contain at least one complete rule before it closes
  for (const m of css.matchAll(/@media[^{]*\{\s*\}/g)) throw new Error('empty @media block: ' + m[0])
})

// FR-011-11 FR-011-12 NFR-011-01 NFR-011-02: tokens defined once, light theme, reduced motion, readable control border
it('spec 011 design tokens, light theme and reduced motion are in the stylesheet', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  for (const t of ['--ue-lime', '--ue-orb-steel', '--ue-orb-graphite', '--ue-orb-gunmetal', '--ue-ink', '--ue-surface', '--ue-control'])
    expect(css.match(new RegExp(t + '\\s*:', 'g'))?.length, t).toBe(1)
  expect(css).toMatch(/color-scheme:\s*light/)
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const v = (t) => css.match(new RegExp(t + '\\s*:\\s*(#[0-9a-fA-F]{6})'))[1]
  expect(ratio(v('--ue-control'), v('--ue-surface'))).toBeGreaterThanOrEqual(3)
  expect(ratio(v('--ue-control'), v('--ue-ground'))).toBeGreaterThanOrEqual(3)
  expect(ratio(v('--ue-ink'), v('--ue-surface'))).toBeGreaterThanOrEqual(4.5)
  expect(ratio(v('--ue-muted'), v('--ue-surface'))).toBeGreaterThanOrEqual(4.5)
})
