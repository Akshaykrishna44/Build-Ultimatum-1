import { useState } from 'react'
import MaterialsBox from './MaterialsBox.jsx'

function isAnswered(q, a) {
  const v = a[q.id]
  if (Array.isArray(v)) return v.length > 0
  return v !== undefined && v !== null && v !== ''
}

function labelOf(q, v) {
  if (Array.isArray(v)) return v.map((x) => labelOf(q, x)).join(', ')
  return (q.options || []).find((o) => o.value === v)?.label ?? String(v)
}

function Question({ q, answers, setAnswers, index }) {
  const v = answers[q.id]
  const set = (val) => setAnswers((a) => ({ ...a, [q.id]: val }))
  const other = answers[q.id + '__other'] || ''
  const setOther = (val) => setAnswers((a) => ({ ...a, [q.id + '__other']: val }))
  const hasDefault = q.default !== undefined && q.default !== null && q.default !== ''
  const isDefault = hasDefault && JSON.stringify(v) === JSON.stringify(q.type === 'multi' && !Array.isArray(q.default) ? [q.default] : q.default)

  return (
    <div className="question card">
      <div className="q-head">
        <span className="q-num">{index}</span>
        <div>
          <div className="q-text">
            {q.q} {q.followup && <span className="followup-tag">follow-up</span>}
          </div>
          {q.why && <div className="q-why">Why an expert asks: {q.why}</div>}
        </div>
      </div>

      {(q.type === 'single' || q.type === 'multi') && (
        <div className="options" role="group" aria-label={q.q}>
          {(q.options || []).map((o) => {
            const on = q.type === 'multi' ? Array.isArray(v) && v.includes(o.value) : v === o.value
            return (
              <button
                key={o.value}
                className={'option' + (on ? ' on' : '')}
                onClick={() => {
                  if (q.type === 'multi') {
                    const arr = Array.isArray(v) ? v : []
                    set(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                  } else set(o.value)
                }}
              >
                <span className={'tick ' + q.type}>{on ? '✓' : ''}</span>
                <span className="opt-body">
                  <span className="opt-label">{o.label}</span>
                  {o.note && <span className="opt-note">{o.note}</span>}
                </span>
              </button>
            )
          })}
          <input className="other" aria-label={'Other answer: ' + q.q} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other / your own specification (optional)" />
        </div>
      )}

      {q.type === 'number' && (
        <div className="num-input">
          <input type="number" aria-label={q.q} value={v ?? ''} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />
          {q.unit && <span className="unit">{q.unit}</span>}
        </div>
      )}

      {(q.type === 'text' || !q.type) && <textarea rows={2} aria-label={q.q} value={v ?? ''} onChange={(e) => set(e.target.value)} placeholder="Type your answer…" />}

      {hasDefault && (
        <div className="q-foot">
          <span className={'default-tag' + (isDefault ? ' using' : '')}>
            {isDefault ? '● Using expert default' : 'Expert default'}: {labelOf(q, q.default)}
            {q.type === 'number' && q.unit ? ' ' + q.unit : ''}
          </span>
          {!isDefault && (
            <button className="btn link small" onClick={() => set(q.type === 'multi' && !Array.isArray(q.default) ? [q.default] : q.default)}>
              Use default
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Interview({ req, map, reused, onDeeper, answers, setAnswers, stageIdx, setStageIdx, onFinish, hasEstimate, onViewEstimate }) {
  const stages = map.stages || []
  const stage = stages[Math.min(stageIdx, stages.length - 1)]
  const total = stages.reduce((a, s) => a + (s.questions || []).length, 0)
  const done = stages.reduce((a, s) => a + (s.questions || []).filter((q) => isAnswered(q, answers)).length, 0)
  let offset = 0
  for (let i = 0; i < stageIdx; i++) offset += (stages[i].questions || []).length
  const last = stageIdx >= stages.length - 1

  const [deep, setDeep] = useState({ busy: false, msg: '' })
  async function askDeeper() {
    setDeep({ busy: true, msg: '' })
    try {
      const n = await onDeeper(stage.id)
      setDeep({ busy: false, msg: n ? `Added ${n} deeper question${n > 1 ? 's' : ''} based on your answers ↑` : 'No further questions needed for this stage ✓' })
    } catch (e) {
      setDeep({ busy: false, msg: '⚠ ' + e.message })
    }
  }

  const go = (i) => {
    setDeep({ busy: false, msg: '' })
    setStageIdx(i)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="interview">
      <aside className="stage-nav card">
        <div className="product-box">
          <div className="eyebrow">{map.domain}</div>
          <div className="product-title">{map.product_title}</div>
          {reused && <div className="reused-tag">✓ Expert-verified knowledge map</div>}
          <div className="muted small">
            {Number(answers.order_qty || req.qty) > 0 ? `${Number(answers.order_qty || req.qty).toLocaleString('en-IN')} ${req.unit}` : 'Quantity: answer in the requirements'} · {answers.market_location || req.location || 'location: in the requirements'}
          </div>
        </div>
        <div className="progress">
          <div className="bar">
            <div style={{ width: (total ? (done / total) * 100 : 0) + '%' }} />
          </div>
          <span>
            {done}/{total} answered
          </span>
        </div>
        <ol>
          {stages.map((s, i) => {
            const qs = s.questions || []
            const d = qs.filter((q) => isAnswered(q, answers)).length
            return (
              <li key={s.id || i} className={(i === stageIdx ? 'on ' : '') + (d === qs.length ? 'complete' : '')} onClick={() => go(i)}>
                <span className="st-num">{d === qs.length ? '✓' : i + 1}</span>
                <span className="st-title">{s.title}</span>
                <span className="st-count">
                  {d}/{qs.length}
                </span>
              </li>
            )
          })}
        </ol>
        <button className="btn primary full-w" onClick={onFinish}>
          {hasEstimate ? '↻ Re-estimate with these answers' : 'Generate estimate now'}
        </button>
        {hasEstimate && (
          <button className="btn ghost full-w" onClick={onViewEstimate}>
            View current estimate
          </button>
        )}
        {map.raw_materials?.length > 0 && (
          <button className="btn ghost full-w rm-link" onClick={() => go(0)}>
            Raw materials ({map.raw_materials.length})
          </button>
        )}
        <div className="muted tiny">Unanswered questions use the expert default.</div>
      </aside>

      <section className="stage-body">
        {stageIdx === 0 && <MaterialsBox materials={map.raw_materials} />}
        {stageIdx === 0 && (
          <div className="card overview">
            <div className="eyebrow">Expert overview</div>
            <p>{map.summary}</p>
            {map.key_considerations?.length > 0 && (
              <ul className="considerations">
                {map.key_considerations.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="stage-head">
          <div className="eyebrow">
            Stage {stageIdx + 1} of {stages.length}
          </div>
          <h2>{stage.title}</h2>
          {stage.intro && <p className="muted">{stage.intro}</p>}
        </div>
        {(stage.questions || []).map((q, i) => (
          <Question key={q.id} q={q} answers={answers} setAnswers={setAnswers} index={offset + i + 1} />
        ))}
        <div className="deeper">
          <button className="btn ghost" disabled={deep.busy} onClick={askDeeper}>
            {deep.busy ? 'Thinking about your answers…' : '🔍 Ask deeper questions for this stage'}
          </button>
          {deep.msg && <span className="small muted">{deep.msg}</span>}
        </div>
        <div className="stage-foot">
          <button className="btn ghost" disabled={stageIdx === 0} onClick={() => go(stageIdx - 1)}>
            ← Back
          </button>
          {!last ? (
            <button className="btn primary" onClick={() => go(stageIdx + 1)}>
              Next: {stages[stageIdx + 1].title} →
            </button>
          ) : (
            <button className="btn primary big" onClick={onFinish}>
              Generate complete estimate →
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
