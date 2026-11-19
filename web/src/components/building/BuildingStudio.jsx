import { useEffect, useMemo, useState } from 'react'
import MaterialsBox from '../MaterialsBox.jsx'
import { LIMITS } from '../../domains/building/takeoff.js'
import { materialsFor } from '../../domains/building/materials.js'
import { visibleStages, withDefaults, defaultOf, CLASS_INFO } from '../../domains/building/questions.js'
import { compute, fmt } from '../../domains/building/takeoff.js'
import { DEFAULT_RATES, mergeRates } from '../../domains/building/rates.js'
import BuildingResults from './BuildingResults.jsx'

const KEY = 'ultimatum-building-v1'
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

function labelOf(q, v) {
  return (q.options || []).find((o) => o.value === v)?.label ?? String(v ?? '')
}

function QuestionCard({ q, a, touched, set, index }) {
  const v = a[q.id]
  const d = defaultOf(q, a)
  const usingDefault = !touched[q.id]
  return (
    <div className={'question card' + (touched[q.id] ? ' answered' : '')}>
      <div className="q-head">
        <span className="q-num">{index}</span>
        <div>
          <div className="q-text">{q.q}</div>
          {q.why && <div className="q-why">Why an engineer asks: {q.why}</div>}
        </div>
      </div>
      {q.type === 'single' && (
        <div className="options" role="group" aria-label={q.q}>
          {q.options.map((o) => (
            <button key={o.value} className={'option' + (v === o.value ? ' on' : '')} onClick={() => set(q.id, o.value)}>
              <span className="tick single">{v === o.value ? '✓' : ''}</span>
              <span className="opt-body">
                <span className="opt-label">{o.label}</span>
                {o.note && <span className="opt-note">{o.note}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {q.type === 'number' && (
        <div className="num-input">
          <input type="number" aria-label={q.q} value={v ?? ''} min={LIMITS[q.id]?.[0]} max={LIMITS[q.id]?.[1]} onChange={(e) => set(q.id, e.target.value === '' ? '' : Number(e.target.value))} />
          {q.unit && <span className="unit">{q.unit}</span>}
        </div>
      )}
      <div className="q-foot">
        <span className={'default-tag' + (usingDefault ? ' using' : '')}>
          {usingDefault ? '● Expert default' : 'Expert default'}: {q.type === 'single' ? labelOf(q, d) : d}
          {q.type === 'number' && q.unit ? ' ' + q.unit : ''}
        </span>
        {!usingDefault && (
          <button className="btn link small" onClick={() => set(q.id, undefined, true)}>
            Reset to default
          </button>
        )}
      </div>
    </div>
  )
}

export default function BuildingStudio({ onExit, prefill }) {
  const pre = prefill && Object.keys(prefill).filter((k) => k !== '_t').length ? Object.fromEntries(Object.entries(prefill).filter(([k]) => k !== '_t')) : null
  const saved = pre ? null : load()
  const [raw, setRaw] = useState(pre || saved?.raw || {})
  const [touched, setTouched] = useState(pre ? Object.fromEntries(Object.keys(pre).map((k) => [k, true])) : saved?.touched || {})
  const [rates, setRates] = useState(() => mergeRates(saved?.rates))
  const [stageIdx, setStageIdx] = useState(pre ? 0 : saved?.stageIdx || 0)
  const [view, setView] = useState(pre ? 'questions' : saved?.view || 'questions')

  const a = useMemo(() => withDefaults(raw, touched), [raw, touched])
  const stages = useMemo(() => visibleStages(a), [a])
  const r = useMemo(() => compute(a, rates), [a, rates])
  const stage = stages[Math.min(stageIdx, stages.length - 1)]

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ raw, touched, rates, stageIdx, view }))
    } catch {
      /* ignore */
    }
  }, [raw, touched, rates, stageIdx, view])

  function set(id, val, reset = false) {
    setRaw((x) => ({ ...x, [id]: val }))
    setTouched((t) => {
      const n = { ...t }
      if (reset) delete n[id]
      else n[id] = true
      return n
    })
  }

  const totalQ = stages.reduce((t, s) => t + s.questions.length, 0)
  const answered = stages.reduce((t, s) => t + s.questions.filter((q) => touched[q.id]).length, 0)
  let offset = 0
  for (let i = 0; i < stageIdx && i < stages.length; i++) offset += stages[i].questions.length
  const go = (i) => {
    setStageIdx(i)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (view === 'results')
    return <BuildingResults a={a} r={r} rates={rates} setRates={setRates} onBack={() => setView('questions')} onExit={onExit} />

  const ci = CLASS_INFO[r.k]
  return (
    <div className="studio">
      <aside className="stage-nav card">
        <div className="product-box">
          <div className="eyebrow">Building & industry engine</div>
          <div className="product-title">{ci?.label || 'Project'}</div>
          <div className="muted small">
            {a.length} × {a.width} m · {fmt(r.geom.builtUp)} m² built-up
          </div>
        </div>
        <div className="progress">
          <div className="bar">
            <div style={{ width: (answered / totalQ) * 100 + '%' }} />
          </div>
          <span>
            {answered}/{totalQ} confirmed
          </span>
        </div>
        <ol>
          {stages.map((s, i) => {
            const d = s.questions.filter((q) => touched[q.id]).length
            return (
              <li key={s.id} className={(i === stageIdx ? 'on ' : '') + (d === s.questions.length ? 'complete' : '')} onClick={() => go(i)}>
                <span className="st-num">{d === s.questions.length ? '✓' : i + 1}</span>
                <span className="st-title">{s.title}</span>
                <span className="st-count">
                  {d}/{s.questions.length}
                </span>
              </li>
            )
          })}
        </ol>
        <button className="btn primary full-w" onClick={() => setView('results')}>
          See full results →
        </button>
        <button className="btn ghost full-w rm-link" onClick={() => go(0)}>
          Raw materials ({materialsFor(a).length})
        </button>
        <button className="btn ghost full-w" onClick={onExit}>
          ← Back to start
        </button>
        <div className="muted tiny">Unconfirmed questions use the engineer's default. Results update live.</div>
      </aside>

      <section className="stage-body">
        {stageIdx === 0 && <MaterialsBox materials={materialsFor(a)} note="For this structure, updated as you answer. Quantities and rates are in the results." />}
        <div className="stage-head">
          <div className="eyebrow">
            Step {stageIdx + 1} of {stages.length}
          </div>
          <h2>{stage.title}</h2>
          <p className="muted">{stage.intro}</p>
        </div>
        {stage.questions.map((q, i) => (
          <QuestionCard key={q.id} q={q} a={a} touched={touched} set={set} index={offset + i + 1} />
        ))}
        <div className="stage-foot">
          <button className="btn ghost" disabled={stageIdx === 0} onClick={() => go(stageIdx - 1)}>
            ← Back
          </button>
          {stageIdx < stages.length - 1 ? (
            <button className="btn primary" onClick={() => go(stageIdx + 1)}>
              Next: {stages[stageIdx + 1].title} →
            </button>
          ) : (
            <button className="btn primary big" onClick={() => setView('results')}>
              See full results →
            </button>
          )}
        </div>
      </section>

      <aside className="live card">
        <div className="eyebrow">Live estimate</div>
        <div className="live-total">₹{fmt(r.cost.total / 1e5, 1)} L</div>
        <div className="muted small">
          ₹{fmt(r.cost.perSqft)}/sq ft · ₹{fmt(r.cost.perM2)}/m²
        </div>
        <div className="live-rows">
          {r.steel && (
            <>
              <div>
                <span>Steel (net)</span>
                <b>{fmt(r.steel.netKg / 1000, 1)} t</b>
              </div>
              <div>
                <span>Steel intensity</span>
                <b>{fmt(r.steel.perM2, 1)} kg/m²</b>
              </div>
              <div>
                <span>Steel to buy</span>
                <b>{fmt(r.steel.boughtKg / 1000, 1)} t</b>
              </div>
              <div className={r.steel.lossPct > 8 ? 'bad' : ''}>
                <span>Cutting + nesting loss</span>
                <b>{fmt(r.steel.lossPct, 1)}%</b>
              </div>
              <div>
                <span>Weld metal / consumable</span>
                <b>
                  {fmt(r.welding.metal)} / {fmt(r.welding.consumable)} kg
                </b>
              </div>
            </>
          )}
          <div>
            <span>Concrete</span>
            <b>{fmt(r.concreteTotals.volWithWaste)} m³</b>
          </div>
          <div>
            <span>Reinforcement</span>
            <b>{fmt(r.concreteTotals.rebarWithWaste / 1000, 1)} t</b>
          </div>
          {r.masonry && (
            <div>
              <span>{r.masonry.unitName}</span>
              <b>{fmt(r.masonry.units)}</b>
            </div>
          )}
        </div>
        {r.checks.filter((c) => c.level === 'warn').slice(0, 3).map((c, i) => (
          <div key={i} className="live-warn">
            ⚠ {c.text}
          </div>
        ))}
      </aside>
    </div>
  )
}
