import { it, expect } from 'vitest'
import { orbState } from '../src/components/Orb.jsx'

// FR-011-02 FR-011-03 FR-011-04 FR-011-10: one function derives exactly four states
it('derives the orb state from app state', () => {
  const states = new Set()
  const s = (x) => { const r = orbState(x); states.add(r); return r }
  expect(s({ view: 'start', text: '' })).toBe('resting')
  expect(s({ view: 'start', text: '   ' })).toBe('resting')
  expect(s({ view: 'start', text: 'shoes' })).toBe('listening')
  expect(s({ view: 'working' })).toBe('thinking')
  expect(s({ view: 'working', failed: true })).toBe('resting')
  expect(s({ view: 'interview' })).toBe('asking')
  expect(s({ view: 'building' })).toBe('asking')
  expect(s({ view: 'start', text: 'x', choosing: true })).toBe('asking')
  expect([...states].sort()).toEqual(['asking', 'listening', 'resting', 'thinking'])
})
