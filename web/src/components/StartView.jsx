import { useMemo, useRef, useState } from 'react'
import { route, parseQuantity } from '../router.js'
import * as engine from '../engine.js'
import { buildTarget, clarifiedNotes, isClearManufacture, isMeaningless, isQuestion, quantityFrom } from '../understand.js'
import { Orb, orbState } from './Orb.jsx'
import Conversation from './Conversation.jsx'

const WAITING = new Set(['understood', 'answer', 'building', 'manual', 'advice', 'sourcing', 'error'])

function buildingSummary(r, text) {
  const p = r.prefill || {}
  const bits = [p.project_type && String(p.project_type).replace(/_/g, ' ')]
  if (p.length && p.width) bits.push(`${p.length} × ${p.width} m`)
  if (p.floors) bits.push(`${p.floors} floor${p.floors > 1 ? 's' : ''}`)
  if (p.industry_class) bits.push(`${p.industry_class} industry`)
  const s = bits.filter(Boolean).join(', ')
  return `${s ? s.charAt(0).toUpperCase() + s.slice(1) : text}. Open the building engine with these details filled in?`
}

// Spec 011 start screen + spec 012 understanding conversation.
export default function StartView({ seed = '', convo, setConvo, onStart, onBuilding, hasSaved, onResume, hasBuilding, onResumeBuilding }) {
  const [text, setText] = useState(seed)
  const [error, setError] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const token = useRef(0)
  const req = useMemo(() => ({ product: text.trim(), notes: '' }), [text])
  const r = useMemo(() => route(req), [req])

  const open = !!(convo && convo.open)
  const lastTurn = open ? convo.turns[convo.turns.length - 1] : null
  const waiting = !!(lastTurn && WAITING.has(lastTurn.kind))

  const addTurn = (turn) => setConvo((c) => ({ ...c, turns: [...c.turns, turn] }))
  const understood = () => [...(convo?.turns || [])].reverse().find((t) => t.u)?.u || null

  // Run an AI step that belongs to the conversation; End task cancels it (FR-001-08 / FR-012-10).
  async function step(fn) {
    const id = ++token.current
    setBusy(true)
    try {
      const turn = await fn()
      if (id === token.current && turn) addTurn(turn)
      return turn
    } finally {
      if (id === token.current) setBusy(false)
    }
  }

  function runUnderstand(t) {
    setConvo({ text: t, open: true, turns: [], answers: {} })
    const id = token.current + 1 // the id step() is about to take; a later End task changes it
    step(async () => {
      try {
        const u = await engine.understand(t)
        // FR-012-13: read as manufacturing or a cost estimate → open the interview directly, carrying the summary
        if ((u.intent === 'make_manufacture' || u.intent === 'estimate_cost') && id === token.current) {
          setConvo((c) => ({ ...c, open: false, turns: [{ kind: 'understood', u }] }))
          goAI(t, { notes: u.summary })
          return null
        }
        if (u.intent === 'unclear') {
          setText('')
          return { kind: 'unclear', reason: u.reason }
        }
        return { kind: u.intent === 'question' ? 'answer' : 'understood', u }
      } catch (e) {
        return { kind: 'manual', error: e.message }
      }
    })
  }

  function goAI(t = req.product, extra = {}) {
    const pq = parseQuantity(t)
    onStart({ product: t, qty: pq ? pq.qty : 0, unit: pq ? pq.unit : 'units', location: '', currency: 'INR', notes: '', ...extra })
  }
  const goBuilding = (prefill) => onBuilding(prefill)

  const submit = (e) => {
    e.preventDefault()
    // FR-011-05: blank input never starts routing or AI
    if (!req.product) return setError('Enter what you have in mind first.')
    setError('')
    token.current++
    setBusy(false)
    // FR-012-02: meaningless input → reply locally, start nothing
    if (isMeaningless(req.product).meaningless) {
      setConvo({ text: req.product, open: true, turns: [{ kind: 'unclear' }], answers: {} })
      setText('')
      return
    }
    // FR-012-08: a question that mentions a house or a factory gets an answer, not the building engine
    if (isQuestion(req.product)) return runUnderstand(req.product)
    if (r.ambiguous) return setChoosing(true)
    // FR-012-08: building → one confirm turn, no AI call
    // FR-012-13: plainly asks to manufacture something → straight into the interview, like v0.5
    if (r.engine !== 'building' && isClearManufacture(req.product)) return goAI()
    if (r.engine === 'building') {
      setConvo({ text: req.product, open: true, turns: [{ kind: 'building', summary: buildingSummary(r, req.product), prefill: r.prefill }], answers: {} })
      return
    }
    runUnderstand(req.product)
  }

  // FR-012-04/06/07: the chosen path, with the clarified answers carried forward
  function onPath(path) {
    const t = convo.text
    const u = understood()
    const answers = convo.answers || {}
    const notes = u ? clarifiedNotes(u, answers) : ''
    const qty = quantityFrom(t, u, answers)
    if (path === 'understand') return runUnderstand(t)
    if (path === 'make') {
      setConvo((c) => ({ ...c, open: false }))
      const pq = parseQuantity(t)
      return goAI(t, { qty, unit: (pq && pq.unit) || 'units', notes })
    }
    if (path === 'build') {
      setConvo((c) => ({ ...c, open: false }))
      const confirmed = convo.turns.find((x) => x.kind === 'building')
      if (confirmed) return goBuilding(confirmed.prefill)
      // FR-012-12: temples, churches, halls… are not in the engineered building engine → AI construction interview
      const target = buildTarget(t, u || {})
      if (target.engine === 'building') return goBuilding(target.prefill)
      return goAI(t, { qty: 1, unit: 'project', notes: ['Construction project (build it).', notes].filter(Boolean).join(' ') })
    }
    if (path === 'buy')
      return step(async () => {
        try {
          return { kind: 'sourcing', plan: await engine.sourcing(t, notes, qty), qty: qty || '' }
        } catch (e) {
          return { kind: 'error', error: e.message, retry: 'buy' }
        }
      })
    if (path === 'advise')
      return step(async () => {
        try {
          return { kind: 'advice', text: await engine.advise(t, notes) }
        } catch (e) {
          return { kind: 'error', error: e.message, retry: 'advise' }
        }
      })
  }

  function endConversation() {
    token.current++
    setBusy(false)
    setText('')
    setConvo((c) => (c ? { ...c, open: false } : c))
  }

  const state = busy ? 'thinking' : orbState({ view: 'start', text: open && waiting ? '' : text, choosing: choosing || (open && waiting) })
  const canResumeConvo = convo && !open && convo.turns && convo.turns.length > 0

  return (
    <div className="ue-start">
      <Orb state={state} />
      {choosing ? (
        <section className="ue-panel">
          <div className="ue-route">Two possible paths</div>
          <h1>Are you building the factory, or making the product?</h1>
          <p className="ue-request">{req.product}</p>
          <div className="ue-options" role="group" aria-label="Choose the engine">
            <button type="button" className="ue-option" onClick={() => goBuilding(r.prefill)}>
              Build the factory
            </button>
            <button type="button" className="ue-option" onClick={() => goAI()}>
              Make the product
            </button>
          </div>
          <button
            type="button"
            className="ue-link"
            onClick={() => {
              setText('')
              setChoosing(false)
            }}
          >
            End task
          </button>
        </section>
      ) : (
        <form className="ue-panel" onSubmit={submit} noValidate>
          <h1>
            <label htmlFor="ue-ask">What do you want to manufacture, build, grow or sell?</label>
          </h1>
          <div className="ue-ask">
            <input
              id="ue-ask"
              autoFocus
              autoComplete="off"
              maxLength={2000}
              value={text}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'ue-ask-error' : undefined}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
              placeholder="500 ICU ventilators"
            />
            <button type="submit" aria-label="Start">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          {error && (
            <p id="ue-ask-error" role="alert" className="ue-error">
              {error}
            </p>
          )}
        </form>
      )}
      {!choosing && open && (
        <Conversation
          convo={convo}
          busy={busy}
          onAnswer={(id, v) => setConvo((c) => ({ ...c, answers: { ...(c.answers || {}), [id]: v } }))}
          onPath={onPath}
          onExample={(e) => {
            setText(e)
            setConvo((c) => ({ ...c, open: false }))
            document.getElementById('ue-ask')?.focus()
          }}
          onRetry={() => runUnderstand(convo.text)}
          onQty={(i, v) => setConvo((c) => ({ ...c, turns: c.turns.map((t, j) => (j === i ? { ...t, qty: v } : t)) }))}
          onEnd={endConversation}
        />
      )}
      {!choosing && !open && (hasSaved || hasBuilding || canResumeConvo) && (
        <div className="ue-resume">
          {canResumeConvo && (
            <button type="button" className="ue-link" onClick={() => setConvo((c) => ({ ...c, open: true }))}>
              Resume last conversation
            </button>
          )}
          {hasSaved && (
            <button type="button" className="ue-link" onClick={onResume}>
              Resume last project
            </button>
          )}
          {hasBuilding && (
            <button type="button" className="ue-link" onClick={onResumeBuilding}>
              Resume last building
            </button>
          )}
        </div>
      )}
    </div>
  )
}
