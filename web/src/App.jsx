import { useEffect, useRef, useState } from 'react'
import StartView from './components/StartView.jsx'
import Working from './components/Working.jsx'
import Interview from './components/Interview.jsx'
import Results from './components/Results.jsx'
import ExpertChat from './components/ExpertChat.jsx'
import BuildingStudio from './components/building/BuildingStudio.jsx'
import { Orb, Rail } from './components/Orb.jsx'
import { normaliseEstimate, normaliseMap } from './estimate.js'
import { normaliseMaterials } from './materials.js'
import { route as routeRequest } from './router.js'
import * as engine from './engine.js'

const STORE_KEY = 'ultimatum-engine-project-v2'
const CONVO_KEY = 'ultimatum-convo-v1'

function hasSavedBuilding() {
  try {
    return !!localStorage.getItem('ultimatum-building-v1')
  } catch {
    return false
  }
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
  } catch {
    return null
  }
}

// Debounced sync of edits to the engine API (no-op in Claude mode).
function useSync(fn, deps, enabled) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!enabled) return
    const t = setTimeout(() => fn().catch(() => {}), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default function App() {
  const saved = load()
  const [mode, setMode] = useState(null)
  const [view, setView] = useState(saved?.view && saved.view !== 'working' ? saved.view : 'start')
  // Bug (found recording the v0.9.3 demo): a new screen kept the previous screen's scroll position, so the
  // interview could open half-way down, past the raw materials box. Every screen change starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])
  const [req, setReq] = useState(saved?.req || null)
  const [projectId, setProjectId] = useState(saved?.projectId || null)
  const [map, setMap] = useState(saved?.map ? { ...normaliseMap(saved.map), raw_materials: normaliseMaterials(saved.map.raw_materials) } : null)
  const [answers, setAnswers] = useState(saved?.answers || {})
  const [stageIdx, setStageIdx] = useState(saved?.stageIdx || 0)
  const [est, setEst] = useState(saved?.est ? normaliseEstimate(saved.est) : null) // old saved projects are cleaned too
  const [pct, setPct] = useState(saved?.pct || null)
  const [meta, setMeta] = useState(saved?.meta || {})
  const [work, setWork] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [buildPrefill, setBuildPrefill] = useState(null)
  const [seed, setSeed] = useState('') // text kept on the start screen if an AI step fails
  // Spec 012: the understanding conversation, kept across End task and reloads (FR-012-10)
  const [convo, setConvo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CONVO_KEY) || 'null')
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(CONVO_KEY, JSON.stringify(convo))
    } catch {
      /* storage unavailable */
    }
  }, [convo])
  const jobRef = useRef(0) // FR-001-08: bumping this cancels a running AI step

  useEffect(() => {
    engine.detectMode().then(setMode)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view, req, projectId, map, answers, stageIdx, est, pct, meta }))
    } catch {
      /* storage unavailable */
    }
  }, [view, req, projectId, map, answers, stageIdx, est, pct, meta])

  const apiMode = mode?.mode === 'api' && !!projectId
  useSync(() => engine.saveAnswers(projectId, answers), [answers], apiMode)
  useSync(() => engine.saveEdits(projectId, est, pct), [est, pct], apiMode && !!est)

  const ctx = { req, projectId, map, answers, est, pct }

  function runJob(title, steps, back, job) {
    setView('working')
    const go = async () => {
      const id = ++jobRef.current
      const alive = () => id === jobRef.current
      setWork({ title, steps, chars: 0 })
      try {
        await job((n) => alive() && setWork((w) => w && { ...w, chars: n }), alive)
        if (alive()) setWork(null)
      } catch (e) {
        if (alive()) setWork((w) => ({ ...w, error: e.message, retry: go, back: () => setView(back) }))
      }
    }
    go()
  }

  // FR-001-08: back to home without deleting work; cancels any running AI step
  function endTask() {
    setSeed('')
    jobRef.current++
    setWork(null)
    setChatOpen(false)
    setView('start')
    window.scrollTo({ top: 0 })
  }

  function runResearch(r) {
    setReq(r)
    setSeed(r.product)
    runJob(
      'Researching ' + r.product,
      ['Identifying the domain and product', 'Researching materials, processes and prices', 'Mapping losses, labour and costs', 'Preparing your requirements'],
      'start',
      async (progress, alive) => {
        const res = await engine.research(r, progress)
        if (!alive()) return
        setSeed('')
        setProjectId(res.projectId)
        setMap(res.map)
        setAnswers(res.answers)
        setMeta({ reused: res.reused, warnings: [] })
        setStageIdx(0)
        setEst(null)
        setPct(null)
        setView('interview')
      },
    )
  }

  function runEstimate() {
    runJob(
      'Building your complete estimate',
      ['Listing every material from base to finish', 'Applying wastage and loss factors', 'Pricing materials across the market', 'Finding sourcing regions and suppliers', 'Planning labour, machinery and timeline'],
      'interview',
      async (progress, alive) => {
        const req2 = engine.reqWithQty(req, map, answers)
        const r = await engine.estimate({ ...ctx, req: req2 }, progress)
        if (!alive()) return
        setReq(req2)
        if (r.req) setReq({ ...req2, ...r.req })
        setEst(r.est)
        setPct(r.pct)
        setMeta((m) => ({ ...m, warnings: r.warnings }))
        setView('results')
      },
    )
  }

  async function deeper(stageId) {
    const r = await engine.followups(ctx, stageId)
    setMap(r.map)
    setAnswers(r.answers)
    return r.added
  }



  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
        <div className="brand" onClick={() => view !== 'working' && setView(map ? (est ? 'results' : 'interview') : 'start')}>
          <span className="logo">
            <Orb size="mini" decor />
          </span>
          <div>
            <div className="brand-name">Ultimatum Engine</div>
            {view !== 'start' && <div className="brand-sub">AI domain expert · requirements → complete estimate</div>}
          </div>
        </div>
        {req && !['start', 'building'].includes(view) && (
          <div className="crumbs">
            <span className={view === 'interview' ? 'on' : ''} onClick={() => map && view !== 'working' && setView('interview')}>
              1 · Requirements
            </span>
            <span
              className={view === 'results' ? 'on' : ''}
              title={est ? 'Open the estimate' : 'Generate the estimate from your answers so far (defaults fill the rest)'}
              onClick={() => {
                // FR-002-16: always reachable; generates the estimate if there isn't one yet
                if (view === 'working') return
                if (est) setView('results')
                else if (map) runEstimate()
              }}
            >
              2 · Estimate
            </span>
          </div>
        )}
        <div className="top-actions">
          {view !== 'start' && (
            <button className="btn ghost" onClick={() => setChatOpen(true)}>
            Ask the expert
          </button>
          )}
          {view !== 'start' && (
            <button className="btn end-task" onClick={endTask} title="Go back to the home page. Your work is kept; resume it from home.">
              ✕ End task
            </button>
          )}
        </div>
        </div>
      </header>

      <main className="main">
        {mode?.mode === 'none' && (
          <div className="card pad notice">
            <b>No AI back end found.</b> Start the engine API (<code>uvicorn ultimatum.api:app</code>, see README) or open this app on claude.ai.
          </div>
        )}
        {view === 'start' && <StartView seed={seed} convo={convo} setConvo={setConvo} onStart={runResearch} onBuilding={(pre) => {
              setBuildPrefill({ ...(pre || {}), _t: Date.now() })
              setView('building')
            }} hasSaved={!!map} onResume={() => setView(est ? 'results' : 'interview')} hasBuilding={hasSavedBuilding()} onResumeBuilding={() => {
              setBuildPrefill(null)
              setView('building')
            }} />}
        {(view === 'building' || (view === 'interview' && map)) && (
          <Rail label={routeRequest({ product: view === 'building' ? 'building' : req?.product || '', notes: '' }).label} />
        )}
        {view === 'building' && <BuildingStudio key={buildPrefill?._t || 'b'} prefill={buildPrefill} onExit={() => setView('start')} />}
        {view === 'working' && work && <Working work={work} />}
        {view === 'interview' && map && (
          <Interview
            req={req}
            map={map}
            reused={meta.reused}
            answers={answers}
            setAnswers={setAnswers}
            stageIdx={stageIdx}
            setStageIdx={setStageIdx}
            onFinish={runEstimate}
            onDeeper={deeper}
            hasEstimate={!!est}
            onViewEstimate={() => setView('results')}
          />
        )}
        {view === 'results' && est && (
          <Results
            req={req}
            map={map}
            answers={answers}
            est={est}
            setEst={setEst}
            pct={pct}
            setPct={setPct}
            warnings={meta.warnings || []}
            onReEstimate={runEstimate}
            onEditAnswers={() => setView('interview')}
          />
        )}
      </main>

      <ExpertChat open={chatOpen} onClose={() => setChatOpen(false)} ctx={ctx} />
    </div>
  )
}
