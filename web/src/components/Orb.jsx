// ─────────────────────────────────────────────────────────────
// Spec 011: the orb. Four states, derived in ONE place (orbState).
//   resting   – nothing typed / idle / after a failure
//   listening – start screen with text in the box
//   thinking  – a real routing or AI request is running (never a timer)
//   asking    – the engine is waiting for the user (interview, building, a choice)
// Pure HTML/CSS (NFR-011-04); hidden from screen readers (NFR-011-03).
// ─────────────────────────────────────────────────────────────

export function orbState({ view, text = '', failed = false, choosing = false }) {
  if (view === 'working') return failed ? 'resting' : 'thinking'
  if (choosing || view === 'interview' || view === 'building') return 'asking'
  return view === 'start' && text.trim() ? 'listening' : 'resting'
}

export function Orb({ state = 'resting', size = 'hero', decor = false }) {
  return (
    <div className={`ue-orb ue-orb-${size} is-${state}`} aria-hidden="true" {...(decor ? {} : { 'data-orb-state': state })}>
      <span className="ue-ring" />
      <span className="ue-ring ue-ring-2" />
      <div className="ue-core">
        <span className="ue-light ue-l1" />
        <span className="ue-light ue-l2" />
        <span className="ue-light ue-l3" />
        <span className="ue-light ue-l4" />
        <span className="ue-spark ue-s1" />
        <span className="ue-spark ue-s2" />
        <span className="ue-sheen" />
      </div>
    </div>
  )
}

/** "Now asking: <engine>" bar shown above the interview and the building engine (FR-011-08). */
export function Rail({ label }) {
  return (
    <div className="ue-rail">
      <Orb state="asking" size="rail" />
      <div>
        <div className="ue-rail-kicker">Now asking</div>
        <div className="ue-rail-label">{label}</div>
      </div>
    </div>
  )
}
