import { useState } from 'react'

// Spec 014: "Raw materials needed" box, shown first, before the interview questions.
// Shows the first 4 tiles; "Show all" opens the rest, so the first question stays close (NFR, §7).
const FIRST = 4

export default function MaterialsBox({ materials, note }) {
  const [all, setAll] = useState(false)
  if (!materials || !materials.length) return null
  const shown = all ? materials : materials.slice(0, FIRST)
  return (
    <section className="card raw-materials" id="raw-materials" aria-labelledby="raw-materials-h">
      <div className="rm-head">
        <h3 id="raw-materials-h">Raw materials needed</h3>
        <span className="muted small">{note || 'Typical materials and where they come from in India. Exact quantities and costs come in the estimate.'}</span>
      </div>
      <div className="rm-grid">
        {shown.map((m) => (
          <article key={m.material} className="rm-tile">
            <div className="rm-name">
              {m.material}
              {m.imported && <span className="rm-imported">Imported{m.origin ? ' from ' + m.origin : ''}</span>}
            </div>
            {m.used_for && <div className="rm-use">{m.used_for}</div>}
            {m.grades.length > 0 && (
              <div className="rm-grades">
                {m.grades.map((g) => (
                  <span key={g} className="rm-chip">
                    {g}
                  </span>
                ))}
              </div>
            )}
            {m.india_sources.length > 0 && (
              <div className="rm-src">
                <span className="rm-k">From</span> {m.india_sources.join(' · ')}
              </div>
            )}
            {m.typical_price && <div className="rm-price">{m.typical_price}</div>}
          </article>
        ))}
      </div>
      {materials.length > FIRST && (
        <button type="button" className="btn ghost rm-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${materials.length} materials`}
        </button>
      )}
    </section>
  )
}
