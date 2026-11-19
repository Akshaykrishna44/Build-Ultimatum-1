import { productReport } from '../report/model.js'
import { appVersion, downloadReport, reportDate } from '../report/index.js'
import { safeUrl } from '../estimate.js'
import { useMemo, useState } from 'react'
import { calculate, grossQty, money, netQty, num, qtyFmt, wasteByReason } from '../calc.js'
import { bomCSV, costSheetCSV, reportMarkdown, saveFile } from '../export.js'

const TABS = ['Overview', 'Options', 'Bill of materials', 'Wastage', 'Sourcing & prices', 'Labour & machinery', 'Cost sheet', 'Process & risks']

function Cell({ value, onChange, w = 80, step = 'any', label }) {
  return <input aria-label={label} className="cell" style={{ width: w }} type="number" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={'kpi card' + (accent ? ' accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function Results({ req, map, answers = {}, est, setEst, pct, setPct, warnings = [], onReEstimate, onEditAnswers }) {
  const [tab, setTab] = useState(TABS[0])
  const [msg, setMsg] = useState('')
  const cur = req.currency
  const m = (n) => money(n, cur)
  const mc = (n) => money(n, cur, true)
  const q = num(req.qty)
  const t = useMemo(() => calculate(est, q, pct), [est, q, pct])
  const L = t.likely
  const bomGroups = useMemo(() => {
    const g = new Map()
    ;(est.bom || []).forEach((b, i) => {
      const k = b.assembly || 'Materials'
      if (!g.has(k)) g.set(k, [])
      g.get(k).push([b, i])
    })
    return [...g.entries()]
  }, [est.bom])
  const waste = useMemo(() => wasteByReason(est, q), [est, q])
  const packaging = (est.bom || []).filter((b) => b.category === 'packaging' || /packag/i.test(b.assembly || ''))
  const packagingCost = packaging.reduce((s2, b) => s2 + grossQty(b, q) * num(b.rate_likely), 0)

  const updRow = (key, i, field) => (val) =>
    setEst((e) => ({ ...e, [key]: e[key].map((r, j) => (j === i ? { ...r, [field]: val } : r)) }))

  async function finalReport(kind) {
    setMsg(kind === 'xlsx' ? 'Preparing the workbook…' : 'Preparing the final report…')
    const model = productReport({ req, map, answers, est, pct, warnings, version: appVersion(), date: reportDate() })
    const r = await downloadReport(model, kind)
    setMsg(r.message)
    setTimeout(() => setMsg(''), 3000)
  }

  async function exp(kind) {
    if (kind === 'pdf' || kind === 'xlsx') return finalReport(kind)
    try {
      let r
      const slug = (est.product_title || 'estimate').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      if (kind === 'bom') r = await saveFile(slug + '-bom.csv', bomCSV(est, q), 'text/csv')
      if (kind === 'cost') r = await saveFile(slug + '-cost-sheet.csv', costSheetCSV(t), 'text/csv')
      if (kind === 'report') r = await saveFile(slug + '-report.md', reportMarkdown(req, map, est, t, pct, money), 'text/markdown')
      if (kind === 'json') r = await saveFile(slug + '-project.json', JSON.stringify({ req, est, pct }, null, 2), 'application/json')
      setMsg(r === 'copied' ? 'Copied to clipboard' : 'File ready')
    } catch {
      setMsg('Export cancelled')
    }
    setTimeout(() => setMsg(''), 2500)
  }

  const breakdown = [
    ['Materials', L.material, '#d97706'],
    ['Labour', L.labour, '#2563eb'],
    ['One-time', L.oneTime, '#7c3aed'],
    ['Pack/logistics/utilities', L.perUnit, '#0891b2'],
    ['Overhead', L.overhead, '#64748b'],
    ['Contingency', L.contingency, '#94a3b8'],
    ['Margin', L.margin, '#16a34a'],
    ['Tax', L.tax, '#dc2626'],
  ]
  const mp = est.market_price || {}

  return (
    <div className="results">
      <div className="results-head">
        <div>
          <div className="eyebrow">{map.domain} · complete estimate</div>
          <h1>{est.product_title || map.product_title}</h1>
          <div className="muted">
            {qtyFmt(q, cur)} {req.unit} · {req.location} · {est.price_basis || 'AI market estimate'}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={onEditAnswers}>
            ✎ Change answers
          </button>
          <button className="btn ghost" onClick={onReEstimate}>
            ↻ Re-estimate
          </button>
          <button className="btn primary final-report" onClick={() => finalReport('pdf')}>
            ⇩ Final report (PDF)
          </button>
          <div className="export">
            <button className="btn ghost">⇩ Export</button>
            <div className="menu">
              <button onClick={() => exp('pdf')}>Final report (.pdf)</button>
              <button onClick={() => exp('xlsx')}>Workbook (.xlsx)</button>
              <button onClick={() => exp('report')}>Full report (.md)</button>
              <button onClick={() => exp('bom')}>Bill of materials (.csv)</button>
              <button onClick={() => exp('cost')}>Cost sheet (.csv)</button>
              <button onClick={() => exp('json')}>Project data (.json)</button>
            </div>
          </div>
          {msg && <span className="toast">{msg}</span>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card pad notice">
          <b>Engine checks ({warnings.length}):</b> {warnings.join(' · ')}
        </div>
      )}
      <div className="kpis">
        <Kpi accent label="Grand total (likely)" value={mc(L.total)} sub={`Range ${mc(t.low.total)} – ${mc(t.high.total)}`} />
        <Kpi label={`Price per ${req.unit.replace(/s$/, '')}`} value={m(L.perUnitTotal)} sub={mp.likely ? `Market: ${m(mp.low)} – ${m(mp.high)}` : `Cost/unit ${m(L.perUnitCost)}`} />
        <Kpi label="Raw materials" value={mc(L.material)} sub={`${(est.bom || []).length} items · waste ${mc(t.wasteValue)}${packaging.length ? ' · packaging ' + m(q ? packagingCost / q : 0) + '/unit' : ''}`} />
        <Kpi label="Workforce" value={qtyFmt(t.headcount) + ' people'} sub={`${qtyFmt(t.labourHours)} labour hours · ${mc(L.labour)}`} />
      </div>

      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x} className={x === tab ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="grid2">
          <div className="card pad">
            <h3>Where the money goes</h3>
            <div className="stack">
              {breakdown.map(([l, v, c]) => (v > 0 ? <div key={l} title={l + ': ' + m(v)} style={{ width: (v / L.total) * 100 + '%', background: c }} /> : null))}
            </div>
            <table className="tbl compact">
              <tbody>
                {breakdown.map(([l, v, c]) => (
                  <tr key={l}>
                    <td>
                      <span className="sw" style={{ background: c }} />
                      {l}
                    </td>
                    <td className="r mono">{m(v)}</td>
                    <td className="r muted mono">{L.total ? ((v / L.total) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Grand total</td>
                  <td className="r mono">{m(L.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card pad">
            <h3>Expert summary</h3>
            <p>{est.summary || map.summary}</p>
            {mp.likely > 0 && (
              <div className={'market ' + (L.perUnitTotal <= mp.likely ? 'good' : 'warn')}>
                Your price per unit is <b>{m(L.perUnitTotal)}</b> vs typical market <b>{m(mp.likely)}</b>{' '}
                {L.perUnitTotal <= mp.likely ? '— competitive.' : '— above market; review materials or margin.'}
                {mp.note && <div className="small">{mp.note}</div>}
              </div>
            )}
            {(est.breakdowns || []).map((b) => (
              <div key={b.title} className="mix">
                <h4>{b.title}</h4>
                <table className="tbl compact">
                  <tbody>
                    {b.rows.map((r) => (
                      <tr key={r.label}>
                        <td>{r.label}</td>
                        <td className="r mono">{num(r.share_pct)}%</td>
                        <td className="r mono">
                          {qtyFmt((num(r.share_pct) / 100) * q)} {req.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Options' && (
        <div className="options-grid">
          {(est.options_catalog || []).map((c) => (
            <div key={c.category} className="card pad">
              <h3>{c.category}</h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Option</th>
                    <th>Cost impact</th>
                    <th>Quality</th>
                    <th>Best for</th>
                  </tr>
                </thead>
                <tbody>
                  {c.options.map((o) => (
                    <tr key={o.name}>
                      <td>
                        <b>{o.name}</b>
                        <div className="small muted">{o.description}</div>
                      </td>
                      <td>{o.cost_impact}</td>
                      <td>{o.quality}</td>
                      <td className="small">{o.best_for}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === 'Bill of materials' && (
        <div className="card pad scroll-x">
          <div className="tbl-note">Edit consumption, wastage or rates — totals update instantly. Gross qty = net ÷ (1 − wastage%).</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Assembly / component / material</th>
                <th className="r">Cons./unit</th>
                <th className="r">Net qty</th>
                <th className="r">Wastage %</th>
                <th className="r">Gross qty to buy</th>
                <th className="r">Rate low</th>
                <th className="r">Rate likely</th>
                <th className="r">Rate high</th>
                <th className="r">Cost (likely)</th>
              </tr>
            </thead>
            <tbody>
              {bomGroups.map(([asm, rows]) => (
                <BomGroup key={asm} asm={asm} rows={rows} q={q} m={m} updRow={updRow} total={rows.reduce((t, [b]) => t + grossQty(b, q) * num(b.rate_likely), 0)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="total">
                <td colSpan={8}>Total raw materials (likely) · value lost to wastage {m(t.wasteValue)}</td>
                <td className="r mono">{m(L.material)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'Wastage' && (
        <div className="grid2">
          <div className="card pad">
            <h3>Wastage by cause</h3>
            <div className="tbl-note">Value lost = (gross − net) × likely rate. Total {m(t.wasteValue)} = {L.material ? ((t.wasteValue / L.material) * 100).toFixed(1) : 0}% of material spend.</div>
            <table className="tbl compact">
              <tbody>
                {waste.byReason.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="r mono">{m(v)}</td>
                    <td className="r">
                      <div className="mini-bar"><div style={{ width: (t.wasteValue ? (v / t.wasteValue) * 100 : 0) + '%' }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card pad scroll-x">
            <h3>Wastage by item</h3>
            <table className="tbl">
              <thead><tr><th>Item</th><th className="r">Wastage %</th><th className="r">Lost qty</th><th className="r">Value lost</th></tr></thead>
              <tbody>
                {waste.rows.filter((r) => r.lostQty > 0).map(({ b, lostQty, lostValue }, i) => (
                  <tr key={i}>
                    <td><b>{b.component}</b><div className="tiny muted">{b.assembly ? b.assembly + ' · ' : ''}{b.wastage_reason || 'process loss'}</div></td>
                    <td className="r mono">{num(b.wastage_pct)}%</td>
                    <td className="r mono">{qtyFmt(lostQty)} {b.unit}</td>
                    <td className="r mono">{m(lostValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Sourcing & prices' && (
        <div className="card pad scroll-x">
          <div className="tbl-note">Where to buy, typical price range and quality grade. AI market estimates — confirm with at least 3 supplier quotes.</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th>Region / cluster</th>
                <th>Source type</th>
                <th>Price range</th>
                <th>Quality</th>
                <th>Lead time</th>
                <th>MOQ</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(est.sourcing || []).map((s, i) => (
                <tr key={i}>
                  <td>
                    <b>{s.material}</b>
                  </td>
                  <td>{s.region}</td>
                  <td>{s.source_type}</td>
                  <td className="mono">{s.price_range}</td>
                  <td>
                    <span className={'grade g' + String(s.quality_grade || '').charAt(0)}>{s.quality_grade}</span>
                  </td>
                  <td>{s.lead_time}</td>
                  <td>{s.moq}</td>
                  <td className="small">{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Labour & machinery' && (
        <div className="grid2">
          <div className="card pad scroll-x">
            <h3>Workforce by skill</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Skill / trade</th>
                  <th className="r">Min / unit</th>
                  <th className="r">Rate / hr</th>
                  <th className="r">Hours</th>
                  <th className="r">People</th>
                  <th className="r">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(est.labour || []).map((l, i) => {
                  const hrs = (num(l.minutes_per_unit) * q) / 60
                  return (
                    <tr key={i}>
                      <td>{l.skill}</td>
                      <td className="r">
                        <Cell value={l.minutes_per_unit} onChange={updRow('labour', i, 'minutes_per_unit')} label={'Minutes per unit, ' + l.skill} w={60} />
                      </td>
                      <td className="r">
                        <Cell value={l.rate_per_hour} onChange={updRow('labour', i, 'rate_per_hour')} label={'Rate per hour, ' + l.skill} w={64} />
                      </td>
                      <td className="r mono">{qtyFmt(hrs)}</td>
                      <td className="r">
                        <Cell value={l.headcount} onChange={updRow('labour', i, 'headcount')} label={'Headcount, ' + l.skill} w={52} step="1" />
                      </td>
                      <td className="r mono">{m(hrs * num(l.rate_per_hour))}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td colSpan={3}>Total</td>
                  <td className="r mono">{qtyFmt(t.labourHours)}</td>
                  <td className="r mono">{qtyFmt(t.headcount)}</td>
                  <td className="r mono">{m(L.labour)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="card pad scroll-x">
            <h3>Machinery, tooling & one-time costs</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Qty</th>
                  <th className="r">Unit cost</th>
                  <th className="r">Amount</th>
                  <th>Charge to order</th>
                </tr>
              </thead>
              <tbody>
                {(est.one_time_costs || []).map((o, i) => (
                  <tr key={i}>
                    <td>
                      {o.item} {o.category && <span className={'cat-badge c-' + o.category}>{o.category}</span>}
                      {o.note && <div className="tiny muted">{o.note}</div>}
                    </td>
                    <td className="r">
                      <Cell value={o.qty} onChange={updRow('one_time_costs', i, 'qty')} label={'Quantity, ' + o.item} w={50} />
                    </td>
                    <td className="r">
                      <Cell value={o.unit_cost} onChange={updRow('one_time_costs', i, 'unit_cost')} label={'Unit cost, ' + o.item} w={90} />
                    </td>
                    <td className="r mono">{m(num(o.qty || 1) * num(o.unit_cost))}</td>
                    <td className="c">
                      <input type="checkbox" aria-label={'Include in order, ' + o.item} checked={!!o.include_in_order} onChange={(e) => updRow('one_time_costs', i, 'include_in_order')(e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td colSpan={3}>Charged to this order</td>
                  <td className="r mono">{m(L.oneTime)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <h4>Per-unit costs</h4>
            <table className="tbl compact">
              <tbody>
                {Object.entries(est.per_unit_costs || {}).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</td>
                    <td className="r">
                      <Cell value={v} onChange={(val) => setEst((e) => ({ ...e, per_unit_costs: { ...e.per_unit_costs, [k]: val } }))} label={k + ' per unit'} />
                    </td>
                    <td className="r mono">{m(num(v) * q)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Cost sheet' && (
        <div className="grid2 wide-left">
          <div className="card pad scroll-x">
            <h3>Cost sheet — low / likely / high</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="r">Low</th>
                  <th className="r">Likely</th>
                  <th className="r">High</th>
                  <th className="r">Per unit (likely)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Raw materials incl. wastage', 'material'],
                  ['Labour', 'labour'],
                  ['One-time costs charged', 'oneTime'],
                  ['Packaging, logistics, utilities', 'perUnit'],
                  ['Direct cost', 'direct', 'sub'],
                  [`Overhead @ ${pct.overhead_pct}%`, 'overhead'],
                  [`Contingency @ ${pct.contingency_pct}%`, 'contingency'],
                  ['Total cost', 'cost', 'sub'],
                  [`Margin @ ${pct.margin_pct}%`, 'margin'],
                  [`Tax @ ${pct.tax_pct}%`, 'tax'],
                  ['GRAND TOTAL', 'total', 'total'],
                ].map(([l, k, cls]) => (
                  <tr key={k} className={cls || ''}>
                    <td>{l}</td>
                    <td className="r mono">{m(t.low[k])}</td>
                    <td className="r mono">{m(L[k])}</td>
                    <td className="r mono">{m(t.high[k])}</td>
                    <td className="r mono">{m(q ? L[k] / q : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tbl-note">Low/high scenarios vary material rates (budget vs premium sources). Labour and other inputs use your edited values.</div>
          </div>
          <div className="card pad">
            <h3>Commercial settings</h3>
            {[
              ['overhead_pct', 'Overhead', 'Factory rent, admin, power, depreciation'],
              ['contingency_pct', 'Contingency', 'Buffer for price rises & surprises'],
              ['margin_pct', 'Margin', 'Your profit on total cost'],
              ['tax_pct', 'Tax (GST/VAT)', 'On cost + margin'],
            ].map(([k, l, h]) => (
              <label key={k} className="setting">
                <div>
                  <b>{l}</b>
                  <div className="tiny muted">{h}</div>
                </div>
                <div className="pct">
                  <input type="range" aria-label={l} min="0" max="50" step="0.5" value={num(pct[k])} onChange={(e) => setPct({ ...pct, [k]: Number(e.target.value) })} />
                  <Cell value={pct[k]} onChange={(v) => setPct({ ...pct, [k]: v })} label={l} w={56} />%
                </div>
              </label>
            ))}
            <div className="big-total">
              <div className="muted small">Grand total (likely)</div>
              <div className="mono">{m(L.total)}</div>
              <div className="muted small">
                {m(L.perUnitTotal)} per {req.unit.replace(/s$/, '')}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Process & risks' && (
        <div className="grid2">
          <div className="card pad">
            <h3>Process steps</h3>
            <ol className="process">
              {(est.process_steps || []).map((p, i) => (
                <li key={i}>
                  <b>{p.step}</b> — {p.description}
                  {p.machine && <div className="tiny muted">Machine/tools: {p.machine}</div>}
                </li>
              ))}
            </ol>
            <h3>Timeline</h3>
            <table className="tbl compact">
              <tbody>
                {(est.timeline || []).map((p, i) => (
                  <tr key={i}>
                    <td>{p.phase}</td>
                    <td className="r">{p.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card pad">
            <h3>Compliance & standards</h3>
            <ul className="considerations">
              {(est.compliance || []).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <h3>Risks & mitigation</h3>
            <ul className="risks">
              {(est.risks || []).map((r, i) => (
                <li key={i}>
                  <b>{r.risk}</b>
                  <div className="small">{r.mitigation}</div>
                </li>
              ))}
            </ul>
            <h3>Assumptions</h3>
            <ul className="considerations small">
              {(est.assumptions || []).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            {[...(map.sources || []), ...(est.sources || [])].length > 0 && (
              <>
                <h3>Web sources used</h3>
                <ul className="considerations small">
                  {[...(map.sources || []), ...(est.sources || [])].filter((s) => safeUrl(s && s.url)).map((s, i) => (
                    <li key={i}>
                      <a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CAT_LABEL = { raw_material: 'raw material', component: 'component', sub_assembly: 'sub-assembly', consumable: 'consumable', packaging: 'packaging' }

function BomGroup({ asm, rows, q, m, updRow, total }) {
  return (
    <>
      <tr className="asm-row">
        <td colSpan={8}>{asm}</td>
        <td className="r mono">{m(total)}</td>
      </tr>
      {rows.map(([b, i]) => {
        const g = grossQty(b, q)
        return (
          <tr key={i}>
            <td>
              <b>{b.component}</b>
              {b.category && <span className={'cat-badge c-' + b.category}>{CAT_LABEL[b.category] || b.category}</span>}
              {b.make_or_buy && <span className={'mb-badge ' + b.make_or_buy}>{b.make_or_buy}</span>}
              <div className="small">
                {b.material}
                {b.grade ? ' · ' + b.grade : ''}
              </div>
              {b.note && <div className="tiny muted">{b.note}</div>}
            </td>
            <td className="r">
              <Cell value={b.consumption_per_unit} onChange={updRow('bom', i, 'consumption_per_unit')} label={'Consumption per unit, ' + b.component} w={70} />
              <div className="tiny muted">{b.unit}</div>
            </td>
            <td className="r mono">{qtyFmt(netQty(b, q))}</td>
            <td className="r">
              <Cell value={b.wastage_pct} onChange={updRow('bom', i, 'wastage_pct')} label={'Wastage %, ' + b.component} w={56} />
              {b.wastage_reason && <div className="tiny muted wr">{b.wastage_reason}</div>}
            </td>
            <td className="r mono">
              <b>{qtyFmt(g)}</b> <span className="tiny muted">{b.unit}</span>
            </td>
            <td className="r">
              <Cell value={b.rate_low} onChange={updRow('bom', i, 'rate_low')} label={'Low rate, ' + b.component} />
            </td>
            <td className="r">
              <Cell value={b.rate_likely} onChange={updRow('bom', i, 'rate_likely')} label={'Likely rate, ' + b.component} />
            </td>
            <td className="r">
              <Cell value={b.rate_high} onChange={updRow('bom', i, 'rate_high')} label={'High rate, ' + b.component} />
            </td>
            <td className="r mono">
              <b>{m(g * num(b.rate_likely))}</b>
            </td>
          </tr>
        )
      })}
    </>
  )
}
