import { useEffect, useState } from 'react'
import { Orb, orbState } from './Orb.jsx'

export default function Working({ work }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (work.error) return
    const t = setInterval(() => setTick((x) => x + 1), 2600)
    return () => clearInterval(t)
  }, [work.error])
  const active = Math.min(tick, work.steps.length - 1)

  return (
    <div className="working card">
      <Orb state={orbState({ view: 'working', failed: !!work.error })} />
      <div className="sr-only" role="status">
        {work.error ? 'Something went wrong' : work.title}
      </div>
      <h2>{work.error ? 'Something went wrong' : work.title}</h2>
      {!work.error && (
        <>
          <ul className="steps">
            {work.steps.map((s, i) => (
              <li key={s} className={i < active ? 'done' : i === active ? 'now' : ''}>
                <span className="dot">{i < active ? '✓' : ''}</span>
                {s}
              </li>
            ))}
          </ul>
          <div className="muted small">
            {work.chars > 0 ? `Expert is writing… ${work.chars.toLocaleString()} characters` : 'Thinking… this takes 30–90 seconds for a full domain analysis.'}
          </div>
        </>
      )}
      {work.error && (
        <>
          <p className="error-text">{work.error}</p>
          <div className="row-gap">
            <button className="btn primary" onClick={work.retry}>
              Retry
            </button>
            <button className="btn ghost" onClick={work.back}>
              Go back
            </button>
          </div>
        </>
      )}
    </div>
  )
}
