import { useEffect, useRef, useState } from 'react'
import { sourcingReport } from '../report/model.js'
import { appVersion, downloadReport, reportDate } from '../report/index.js'
import { money } from '../calc.js'
import { EXAMPLES, PATHS, sourcingTotals } from '../understand.js'

// Spec 012: the conversation under the orb. Pure rendering; StartView owns the logic.

// FR-012-14: one click into the full expert interview from any reply
const INTERVIEW = { id: 'make', label: 'Start full requirements' }
const withInterview = (paths) => (paths.some((p) => p.id === 'make') ? paths : [...paths, INTERVIEW])

function PathButtons({ paths, onPath, disabled }) {
  return (
    <div className="ue-paths" role="group" aria-label="Ways to go ahead">
      {paths.map((p) => (
        <button key={p.id + p.label} type="button" className="ue-path" disabled={disabled} onClick={() => onPath(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

function Questions({ questions, answers, onAnswer }) {
  return (
    <div className="ue-qs">
      {questions.map((q) => (
        <div key={q.id} className="ue-q">
          <label className="ue-q-text" htmlFor={'ue-q-' + q.id}>
            {q.q}
          </label>
          {q.options.length > 0 && (
            <div className="ue-opts" role="group" aria-label={q.q}>
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={'ue-opt' + (answers[q.id] === o ? ' on' : '')}
                  aria-pressed={answers[q.id] === o}
                  onClick={() => onAnswer(q.id, answers[q.id] === o ? '' : o)}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <input
            id={'ue-q-' + q.id}
            className="ue-q-input"
            value={answers[q.id] || ''}
            placeholder="Or type your answer"
            autoComplete="off"
            onChange={(e) => onAnswer(q.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

function Paragraphs({ text }) {
  return (
    <div className="ue-prose">
      {String(text)
        .split(/\n+/)
        .filter((l) => l.trim())
        .map((l, i) => (/^\s*[-•]\s+/.test(l) ? <p key={i} className="ue-bullet">{l.replace(/^\s*[-•]\s+/, '')}</p> : <p key={i}>{l}</p>))}
    </div>
  )
}

function Sourcing({ turn, onQty, text }) {
  const [msg, setMsg] = useState('')
  async function download() {
    setMsg('Preparing the plan…')
    const r = await downloadReport(sourcingReport({ text, plan: turn.plan, qty: Number(turn.qty) || 0, version: appVersion(), date: reportDate() }), 'pdf')
    setMsg(r.message.replace('Final report', 'Plan'))
    setTimeout(() => setMsg(''), 3000)
  }
  const { plan } = turn
  const cur = plan.currency || 'INR'
  const qty = Number(turn.qty) || 0
  return (
    <div className="ue-sourcing">
      <div className="ue-qty">
        <label htmlFor="ue-src-qty">Quantity</label>
        <input id="ue-src-qty" type="number" min="0" inputMode="numeric" value={turn.qty || ''} placeholder="How many?" onChange={(e) => onQty(e.target.value)} />
        <span className="muted small">Totals are worked out by the app from the per-unit prices.</span>
      </div>
      <div className="ue-src-options">
        {plan.options.map((o) => {
          const t = sourcingTotals(o, qty)
          return (
            <div key={o.name} className="ue-src-card" data-total-likely={t.likely.total}>
              <div className="ue-src-head">
                <h3>{o.name}</h3>
                {o.what && <p className="muted small">{o.what}</p>}
              </div>
              <table className="ue-src-table">
                <tbody>
                  <tr>
                    <th scope="row">Price per piece</th>
                    <td>
                      {money(t.low.unit, cur)} – {money(t.high.unit, cur)} <span className="muted">(likely {money(t.likely.unit, cur)})</span>
                    </td>
                  </tr>
                  {t.likely.custom > 0 && (
                    <tr>
                      <th scope="row">Printing / customisation per piece</th>
                      <td>
                        {money(t.low.custom, cur)} – {money(t.high.custom, cur)}
                      </td>
                    </tr>
                  )}
                  {t.likely.delivery > 0 && (
                    <tr>
                      <th scope="row">Delivery (whole order)</th>
                      <td>
                        {money(t.low.delivery, cur)} – {money(t.high.delivery, cur)}
                      </td>
                    </tr>
                  )}
                  {qty > 0 && (
                    <tr className="ue-src-total">
                      <th scope="row">Total for {qty.toLocaleString('en-IN')}</th>
                      <td>
                        <b>{money(t.likely.total, cur)}</b> <span className="muted">range {money(t.low.total, cur)} – {money(t.high.total, cur)} · {money(t.likely.perUnit, cur)} each</span>
                      </td>
                    </tr>
                  )}
                  {o.moq && (
                    <tr>
                      <th scope="row">Minimum order</th>
                      <td>{o.moq}</td>
                    </tr>
                  )}
                  {o.lead_time && (
                    <tr>
                      <th scope="row">Lead time</th>
                      <td>{o.lead_time}</td>
                    </tr>
                  )}
                  {o.where.length > 0 && (
                    <tr>
                      <th scope="row">Where to buy</th>
                      <td>{o.where.join(' · ')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {o.notes && <p className="small">{o.notes}</p>}
            </div>
          )
        })}
      </div>
      {plan.tips.length > 0 && (
        <ul className="ue-tips">
          {plan.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <p className="muted small">Prices are AI estimates of the current market; confirm with two or three suppliers before ordering.</p>
      <div className="ue-src-download">
        <button type="button" className="btn ghost" onClick={download}>
          ⇩ Download plan (PDF)
        </button>
        {msg && <span className="muted small" role="status">{msg}</span>}
      </div>
    </div>
  )
}

export default function Conversation({ convo, busy, onAnswer, onPath, onExample, onRetry, onQty, onEnd }) {
  const answers = convo.answers || {}
  const ref = useRef(null)
  const n = convo.turns.length
  // bring each new turn into view (not on the first render, so the orb and box stay visible)
  useEffect(() => {
    if (n < 2 && !busy) return
    const el = ref.current?.querySelector('.ue-turn:last-of-type')
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [n, busy])
  return (
    <section className="ue-turns" aria-live="polite" ref={ref}>
      <div className="ue-you">
        <span className="ue-you-k">You asked</span> {convo.text}
      </div>
      {convo.turns.map((turn, i) => {
        const last = i === convo.turns.length - 1
        switch (turn.kind) {
          case 'unclear':
            return (
              <div key={i} className="ue-turn">
                <h2>I didn't understand that</h2>
                <p>{turn.reason || 'Tell me what you want to make, build, buy, grow or know. For example:'}</p>
                <div className="ue-opts" role="group" aria-label="Example requests">
                  {EXAMPLES.map((e) => (
                    <button key={e} type="button" className="ue-example" onClick={() => onExample(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )
          case 'understood':
            return (
              <div key={i} className="ue-turn">
                <h2>Here's what I understood</h2>
                <p className="ue-summary">{turn.u.summary}</p>
                {turn.u.questions.length > 0 && <Questions questions={turn.u.questions} answers={answers} onAnswer={onAnswer} />}
                <p className="ue-next">How do you want to go ahead?</p>
                <PathButtons paths={withInterview(turn.u.paths.concat(turn.u.paths.some((p) => p.id === 'advise') ? [] : [{ id: 'advise', label: 'Just advise me' }]))} onPath={onPath} disabled={busy} />
              </div>
            )
          case 'answer':
            return (
              <div key={i} className="ue-turn">
                <h2>{turn.u.summary || 'Answer'}</h2>
                <Paragraphs text={turn.u.answer} />
                <PathButtons paths={withInterview(turn.u.paths.filter((p) => p.id !== 'advise' && p.id !== 'make'))} onPath={onPath} disabled={busy} />
              </div>
            )
          case 'building':
            return (
              <div key={i} className="ue-turn">
                <h2>This is a building</h2>
                <p className="ue-summary">{turn.summary}</p>
                <PathButtons paths={[{ id: 'build', label: 'Open the building engine' }, { id: 'understand', label: 'No, something else' }]} onPath={onPath} disabled={busy} />
              </div>
            )
          case 'manual':
            return (
              <div key={i} className="ue-turn">
                <h2>Choose how to continue</h2>
                <p className="muted">{turn.error} You can still pick a path yourself.</p>
                <PathButtons paths={PATHS} onPath={onPath} disabled={busy} />
                <button type="button" className="ue-link" onClick={onRetry}>
                  Try reading it again
                </button>
              </div>
            )
          case 'advice':
            return (
              <div key={i} className="ue-turn">
                <h2>Expert advice</h2>
                <Paragraphs text={turn.text} />
                {last && <PathButtons paths={[...PATHS.filter((p) => p.id === 'buy'), INTERVIEW]} onPath={onPath} disabled={busy} />}
              </div>
            )
          case 'sourcing':
            return (
              <div key={i} className="ue-turn ue-turn-wide">
                <h2>Sourcing plan</h2>
                <Sourcing turn={turn} text={convo.text} onQty={(v) => onQty(i, v)} />
                {last && <PathButtons paths={[INTERVIEW, ...PATHS.filter((p) => p.id === 'advise')]} onPath={onPath} disabled={busy} />}
              </div>
            )
          case 'error':
            return (
              <div key={i} className="ue-turn">
                <h2>Something went wrong</h2>
                <p role="alert" className="ue-error">
                  {turn.error}
                </p>
                <button type="button" className="ue-path" onClick={() => onPath(turn.retry)}>
                  Retry
                </button>
              </div>
            )
          default:
            return null
        }
      })}
      {busy && (
        <div className="ue-turn ue-busy" role="status">
          Thinking…
        </div>
      )}
      <button type="button" className="ue-link ue-turns-end" onClick={onEnd}>
        End task
      </button>
    </section>
  )
}
