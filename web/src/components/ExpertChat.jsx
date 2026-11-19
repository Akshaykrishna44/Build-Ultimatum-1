import { safeUrl } from '../estimate.js'
import { useEffect, useRef, useState } from 'react'
import { chat } from '../engine.js'

const SUGGESTED = [
  'Which raw material has the biggest impact on cost?',
  'How can I reduce wastage?',
  'Where in India can I get the best quality at a good price?',
  'What certifications do I need?',
  'What machines do I need and what do they cost?',
]

export default function ExpertChat({ open, onClose, ctx }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  async function send(text) {
    const qText = (text ?? input).trim()
    if (!qText || busy) return
    setInput('')
    const clean = msgs.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content }))
    const history = [...clean, { role: 'user', content: qText }]
    setMsgs([...msgs, { role: 'user', content: qText }, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      const r = await chat(ctx, history, (txt) => setMsgs((ms) => ms.map((m, i) => (i === ms.length - 1 ? { ...m, content: txt } : m))))
      setMsgs((ms) => ms.map((m, i) => (i === ms.length - 1 ? { ...m, content: r.text, sources: r.sources } : m)))
    } catch (e) {
      setMsgs((ms) => ms.map((m, i) => (i === ms.length - 1 ? { ...m, content: '⚠ ' + e.message, error: true } : m)))
    }
    setBusy(false)
  }

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'chat' + (open ? ' open' : '')}>
        <div className="chat-head">
          <div>
            <b>Ask the domain expert</b>
            <div className="tiny muted">{ctx.map ? ctx.map.product_title : 'Any product, any industry'}</div>
          </div>
          <button className="btn ghost small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="chat-body">
          {msgs.length === 0 && (
            <div className="chat-empty">
              <p className="muted small">Ask anything about materials, grades, suppliers, wastage, machines, standards or pricing.</p>
              {SUGGESTED.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={'bubble ' + m.role + (m.error ? ' error' : '')}>
              {m.content || <span className="typing">●●●</span>}
              {m.sources?.some((s) => safeUrl(s && s.url)) && (
                <div className="chat-sources">
                  {m.sources.filter((s) => safeUrl(s && s.url)).slice(0, 5).map((s) => (
                    <a key={s.url} href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">
                      {s.title || s.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input aria-label="Ask the expert a question" maxLength={4000} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" />
          <button className="btn primary" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </aside>
    </>
  )
}
