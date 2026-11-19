import { useMemo, useState } from 'react'
import { compute, fmt, CONCRETE_WASTE, REBAR_CUT_PCT, REBAR_LAP_PCT, PLATE_NEST_PCT, PAINT_SPRAY_LOSS } from '../../domains/building/takeoff.js'
import { PROCESSES, weldingCalc } from '../../domains/building/welding.js'
import { CLASS_INFO } from '../../domains/building/questions.js'
import { chat } from '../../engine.js'
import { saveFile } from '../../export.js'
import { buildingReport } from '../../report/model.js'
import { appVersion, downloadReport, reportDate } from '../../report/index.js'

const TABS = ['Summary', 'Steel schedule', 'Cutting & wastage', 'Welding', 'Concrete & rebar', 'Envelope & paint', 'BOQ & cost', 'Rates', 'AI expert review']
const MIX = { M20: [8, 0.45, 0.85], M25: [9, 0.43, 0.82], M30: [10, 0.41, 0.8] }
const CAT_COLORS = ['#d97706', '#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#dc2626', '#64748b', '#a16207', '#0f766e', '#be185d']

const rs = (v) => '₹' + fmt(v)
const lakh = (v) => '₹' + fmt(v / 1e5, 2) + ' L'

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={'kpi card' + (accent ? ' accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function BarPlan({ cut }) {
  // Group identical cutting patterns
  const patterns = {}
  for (const b of cut.plan || []) {
    const key = b.cuts.map((c) => c.len.toFixed(2)).join('+')
    patterns[key] = patterns[key] || { bar: b, count: 0 }
    patterns[key].count++
  }
  const list = Object.values(patterns).slice(0, 8)
  if (!list.length) return <div className="muted small">Cut-to-length or roll-formed: each piece is supplied at exact length, with no offcut.</div>
  return (
    <div className="barplan">
      {list.map(({ bar, count }, i) => (
        <div key={i} className="barrow">
          <span className="barcount">{count}×</span>
          <div className="bartrack">
            {bar.cuts.map((c, j) => (
              <div key={j} className="cutseg" style={{ width: (c.len / cut.stock) * 100 + '%' }} title={c.mark + ' — ' + c.len.toFixed(2) + ' m'}>
                {c.len.toFixed(2)}
              </div>
            ))}
            {bar.offcut > 0.005 && (
              <div className={'offseg' + (bar.offcut < cut.minReuse ? ' scrap' : '')} style={{ width: (bar.offcut / cut.stock) * 100 + '%' }} title={'Offcut ' + bar.offcut.toFixed(2) + ' m'}>
                {bar.offcut >= 0.4 ? bar.offcut.toFixed(2) : ''}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="legend small muted">
        <span className="lg cut" /> piece <span className="lg off" /> reusable offcut <span className="lg scrap" /> scrap. Bar = {cut.stock} m.
      </div>
    </div>
  )
}

export default function BuildingResults({ a, r, rates, setRates, onBack, onExit }) {
  const [tab, setTab] = useState(TABS[0])
  const [review, setReview] = useState({ busy: false, text: '', err: '' })
  const [msg, setMsg] = useState('')
  const ci = CLASS_INFO[r.k]
  const s = r.steel
  const w = r.welding

  const policies = useMemo(() => {
    if (!s) return []
    return [
      ['std', 'Standard 12 m bars'],
      ['best', 'Best of 6 / 9 / 10.5 / 12 m'],
      ['ctl', 'Cut-to-length from mill'],
    ].map(([p, label]) => {
      const x = compute({ ...a, stock_policy: p }, rates)
      return { p, label, bought: x.steel.boughtKg, loss: x.steel.lossPct, steelCost: x.cost.byCat['Structural steel'], weldCost: x.cost.byCat['Welding'], total: x.cost.total }
    })
  }, [a, rates, s])

  const processes = useMemo(() => {
    if (!w) return []
    return Object.keys(PROCESSES).map((k) => {
      const x = weldingCalc(w.lengths, { process: k, filletSize: Number(a.fillet_size) || 6, buttThk: Number(a.butt_thk) || 12 })
      const cost = x.consumable * rates['weld_' + k].value + x.fluxKg * rates.saw_flux.value + x.gasM3 * rates.gas.value + x.kWh * rates.power.value + x.welderHr * rates.welder.value
      return { k, x, cost }
    })
  }, [w, a, rates])

  function summaryText() {
    const lines = [
      `Project: ${a.project_type}${a.industry_class ? ' / ' + a.industry_class + ' industry' : ''}, ${a.length} × ${a.width} m, system ${a.system}, soil ${a.soil}, seismic zone ${a.seismic}.`,
      s ? `Steel: ${fmt(s.netKg / 1000, 1)} t net (${fmt(s.perM2, 1)} kg/m²), bought ${fmt(s.boughtKg / 1000, 1)} t, loss ${fmt(s.lossPct, 1)}%. Columns ${a.col_section || 'RCC'}, rafters ${a.raf_section}, purlins ${a.purlin_section} @ ${a.purlin_spacing} m, bay ${fmt(r.geom.bay, 2)} m, spans ${r.geom.spans}, eave ${r.geom.E} m, crane ${a.crane || 0} t, bracing ${a.bracing}, grade ${a.steel_grade}.` : '',
      w ? `Welding: ${PROCESSES[w.process].label}, fillet ${a.fillet_size} mm, ${fmt(w.lengths.filletM)} m fillet + ${fmt(w.lengths.buttM)} m butt, weld metal ${fmt(w.metal)} kg, consumable ${fmt(w.consumable)} kg, NDT ${a.ndt}.` : '',
      `Concrete ${a.concrete_grade}: ${fmt(r.concreteTotals.vol)} m³, rebar ${fmt(r.concreteTotals.rebar / 1000, 1)} t, foundation ${a.footing_type} ${a.footing_size} m × ${a.footing_depth} m.`,
      `Cost: total ₹${fmt(r.cost.total)} (₹${fmt(r.cost.perSqft)}/sqft). By category: ${Object.entries(r.cost.byCat).map(([c, v]) => c + ' ₹' + fmt(v)).join(', ')}.`,
      `Engine checks: ${r.checks.map((c) => c.text).join(' | ')}`,
    ]
    return lines.filter(Boolean).join('\n')
  }

  async function runReview() {
    setReview({ busy: true, text: '', err: '' })
    const prompt = `Act as a senior structural engineer and quantity surveyor in India. Review this building takeoff produced by a calculation engine.

${summaryText()}

Give, concisely:
1. Missing items or scope gaps (with typical % or quantities)
2. Risky assumptions or sections that look under- or over-designed
3. The next questions to ask the client (most important first)
4. Optimisation ideas to cut cost or wastage (steel, welding, concrete), with expected savings
5. Applicable IS codes and approvals to check`
    try {
      const res = await chat({ req: null }, [{ role: 'user', content: prompt }], (t) => setReview((x) => ({ ...x, text: t })))
      setReview({ busy: false, text: res.text, err: '' })
    } catch (e) {
      setReview({ busy: false, text: '', err: e.message })
    }
  }

  async function finalReport(kind) {
    setMsg(kind === 'xlsx' ? 'Preparing the workbook…' : 'Preparing the final report…')
    const res = await downloadReport(buildingReport({ a, r, rates, version: appVersion(), date: reportDate() }), kind)
    setMsg(res.message)
    setTimeout(() => setMsg(''), 3000)
  }

  async function exportBoq() {
    const rows = [['Category', 'Item', 'Qty', 'Unit', 'Rate', 'Amount', 'Note'], ...r.boq.map((b) => [b.cat, b.item, b.qty.toFixed(2), b.unit, b.rate.toFixed(2), b.amount.toFixed(0), b.note])]
    rows.push([], ['', 'Direct cost', '', '', '', r.cost.direct.toFixed(0)], ['', `Overhead ${a.overhead_pct}%`, '', '', '', r.cost.overhead.toFixed(0)], ['', `Contingency ${a.contingency_pct}%`, '', '', '', r.cost.contingency.toFixed(0)], ['', `Margin ${a.margin_pct}%`, '', '', '', r.cost.margin.toFixed(0)], ['', `GST ${a.gst_pct}%`, '', '', '', r.cost.gst.toFixed(0)], ['', 'GRAND TOTAL', '', '', '', r.cost.total.toFixed(0)])
    const csv = rows.map((x) => x.map((c) => (/[",\n]/.test(String(c ?? '')) ? '"' + String(c).replace(/"/g, '""') + '"' : c ?? '')).join(',')).join('\n')
    try {
      const res = await saveFile('building-boq.csv', csv, 'text/csv')
      setMsg(res === 'copied' ? 'Copied to clipboard' : 'BOQ file ready')
    } catch {
      setMsg('Export cancelled')
    }
    setTimeout(() => setMsg(''), 2500)
  }

  const cats = Object.entries(r.cost.byCat).filter(([, v]) => v > 0)

  return (
    <div className="results">
      <div className="results-head">
        <div>
          <div className="eyebrow">Building & industry engine · results</div>
          <h1>
            {ci?.label} · {a.system?.toUpperCase()} · {a.length} × {a.width} m
          </h1>
          <div className="muted">
            {fmt(r.geom.builtUp)} m² built-up ({fmt(r.geom.builtUp * 10.7639)} sq ft) · {ci?.loads}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={onBack}>
            ✎ Change answers
          </button>
          <button className="btn primary final-report" onClick={() => finalReport('pdf')}>
            ⇩ Final report (PDF)
          </button>
          <button className="btn ghost" onClick={() => finalReport('xlsx')}>
            ⇩ Workbook (.xlsx)
          </button>
          <button className="btn ghost" onClick={exportBoq}>
            ⇩ BOQ (.csv)
          </button>
          <button className="btn ghost" onClick={onExit}>
            Start page
          </button>
          {msg && <span className="toast">{msg}</span>}
        </div>
      </div>

      <div className="kpis kpis6">
        <Kpi accent label="Total project cost" value={lakh(r.cost.total)} sub={`₹${fmt(r.cost.perSqft)}/sq ft incl. GST`} />
        {s ? <Kpi label="Structural steel" value={fmt(s.netKg / 1000, 1) + ' t'} sub={`${fmt(s.perM2, 1)} kg/m² · buy ${fmt(s.boughtKg / 1000, 1)} t`} /> : <Kpi label="Reinforcement" value={fmt(r.concreteTotals.rebarWithWaste / 1000, 1) + ' t'} sub="incl. laps + cutting" />}
        {s && <Kpi label="Steel wastage" value={fmt(s.lossPct, 1) + '%'} sub={`${fmt(s.lossKg)} kg lost to cutting + nesting`} />}
        {w && <Kpi label="Weld metal" value={fmt(w.metal) + ' kg'} sub={`${fmt(w.consumable)} kg ${w.process.toUpperCase()} consumable`} />}
        <Kpi label="Concrete" value={fmt(r.concreteTotals.volWithWaste) + ' m³'} sub={`${a.concrete_grade} incl. ${CONCRETE_WASTE}% wastage`} />
        {r.masonry && <Kpi label={r.masonry.unitName[0].toUpperCase() + r.masonry.unitName.slice(1)} value={fmt(r.masonry.units)} sub={`${fmt(r.masonry.vol)} m³ walls`} />}
      </div>

      <nav className="tabs">
        {TABS.filter((t) => (s ? true : !['Steel schedule', 'Cutting & wastage', 'Welding'].includes(t))).map((x) => (
          <button key={x} className={x === tab ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </nav>

      {tab === 'Summary' && (
        <div className="grid2">
          <div className="card pad">
            <h3>Cost by package</h3>
            <div className="stack">
              {cats.map(([c, v], i) => (
                <div key={c} title={c} style={{ width: (v / r.cost.direct) * 100 + '%', background: CAT_COLORS[i % CAT_COLORS.length] }} />
              ))}
            </div>
            <table className="tbl compact">
              <tbody>
                {cats.map(([c, v], i) => (
                  <tr key={c}>
                    <td>
                      <span className="sw" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      {c}
                    </td>
                    <td className="r mono">{rs(v)}</td>
                    <td className="r mono muted">{fmt((v / r.cost.direct) * 100, 1)}%</td>
                  </tr>
                ))}
                <tr className="sub">
                  <td>Direct cost</td>
                  <td className="r mono">{rs(r.cost.direct)}</td>
                  <td />
                </tr>
                <tr>
                  <td>Overhead {a.overhead_pct}% + contingency {a.contingency_pct}%</td>
                  <td className="r mono">{rs(r.cost.overhead + r.cost.contingency)}</td>
                  <td />
                </tr>
                <tr>
                  <td>Margin {a.margin_pct}% + GST {a.gst_pct}%</td>
                  <td className="r mono">{rs(r.cost.margin + r.cost.gst)}</td>
                  <td />
                </tr>
                <tr className="total">
                  <td>Grand total</td>
                  <td className="r mono">{rs(r.cost.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card pad">
            <h3>Engineering checks</h3>
            <ul className="checks">
              {r.checks.map((c, i) => (
                <li key={i} className={c.level}>
                  {c.text}
                </li>
              ))}
            </ul>
            <h3>Geometry</h3>
            <table className="tbl compact">
              <tbody>
                <tr><td>Footprint</td><td className="r mono">{a.length} × {a.width} m = {fmt(r.geom.footprint)} m²</td></tr>
                {r.geom.nBays && (
                  <>
                    <tr><td>Bays × bay spacing</td><td className="r mono">{r.geom.nBays} × {fmt(r.geom.bay, 2)} m ({r.geom.frames} frames)</td></tr>
                    <tr><td>Spans × span width</td><td className="r mono">{r.geom.spans} × {fmt(r.geom.spanW, 2)} m</td></tr>
                    <tr><td>Roof slope / ridge rise</td><td className="r mono">{fmt(r.geom.slopeDeg, 1)}° / {fmt(r.geom.rise, 2)} m</td></tr>
                    <tr><td>Half-rafter length</td><td className="r mono">{fmt(r.geom.half, 2)} m</td></tr>
                    <tr><td>Purlin lines / girt rows / braced bays</td><td className="r mono">{s.purlinLines} / {s.girtRows} / {s.braced}</td></tr>
                  </>
                )}
                {r.geom.colsPF && <tr><td>Column grid</td><td className="r mono">{r.geom.nx} × {r.geom.ny} bays → {r.geom.colsPF} columns/floor</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Steel schedule' && s && (
        <div className="card pad scroll-x">
          <div className="tbl-note">Net weights from geometry × section weight (IS 808 nominal kg/m). {a.steel_grade === 'E350' ? 'E350: main frames taken 10% lighter.' : ''}</div>
          <table className="tbl">
            <thead>
              <tr><th>Member</th><th>Section</th><th className="r">kg/m</th><th>Pieces</th><th className="r">Net length</th><th className="r">Net weight</th></tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.label}</b></td>
                  <td>{m.section}</td>
                  <td className="r mono">{fmt(m.kgPerM, 2)}</td>
                  <td className="small">{m.pieces.map((p) => `${p.qty} × ${fmt(p.length, 2)} m (${p.mark})`).join('; ')}</td>
                  <td className="r mono">{fmt(m.netM)} m</td>
                  <td className="r mono">{fmt(m.netKg)} kg</td>
                </tr>
              ))}
              <tr><td><b>Base plates</b></td><td colSpan={4} className="small">{s.steelCols} plates</td><td className="r mono">{fmt(s.basePlatesKg)} kg</td></tr>
              <tr><td><b>Connections allowance</b></td><td colSpan={4} className="small">{a.conn_pct}% of member weight (end plates, haunches, cleats, gussets, bolts)</td><td className="r mono">{fmt(s.connKg)} kg</td></tr>
              {s.bracketKg > 0 && <tr><td><b>Crane brackets</b></td><td colSpan={4} /><td className="r mono">{fmt(s.bracketKg)} kg</td></tr>}
              {s.railKg > 0 && <tr><td><b>Crane rails</b></td><td colSpan={4} /><td className="r mono">{fmt(s.railKg)} kg</td></tr>}
              {s.mezzKg > 0 && <tr><td><b>Mezzanine</b></td><td colSpan={4} className="small">{a.mezz_area} m² × 40 kg/m²</td><td className="r mono">{fmt(s.mezzKg)} kg</td></tr>}
            </tbody>
            <tfoot>
              <tr className="total"><td colSpan={5}>Total structural steel (net) · {fmt(s.perM2, 1)} kg/m² (typical {ci?.steel?.join('–')} for {ci?.label})</td><td className="r mono">{fmt(s.netKg)} kg</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'Cutting & wastage' && s && (
        <>
          <div className="card pad scroll-x">
            <h3>Option comparison: how you buy steel</h3>
            <table className="tbl">
              <thead><tr><th>Stock policy</th><th className="r">Steel to buy</th><th className="r">Cutting + nesting loss</th><th className="r">Steel package</th><th className="r">Welding</th><th className="r">Project total</th></tr></thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.p} className={p.p === a.stock_policy ? 'sub' : ''}>
                    <td>{p.label} {p.p === a.stock_policy && <span className="followup-tag">selected</span>}</td>
                    <td className="r mono">{fmt(p.bought / 1000, 2)} t</td>
                    <td className="r mono">{fmt(p.loss, 1)}%</td>
                    <td className="r mono">{rs(p.steelCost)}</td>
                    <td className="r mono">{rs(p.weldCost)}</td>
                    <td className="r mono"><b>{rs(p.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tbl-note">Cutting a long rafter into short stock adds splices, so check the welding column. Cold-formed purlins and girts are roll-formed to length in every option.</div>
          </div>
          <div className="cut-grid">
            {s.groups.map((g) => (
              <div key={g.key} className="card pad">
                <div className="cut-head">
                  <h3>{g.key}</h3>
                  <span className={'grade ' + (g.cut.chargedLossPct > 8 ? 'gC' : g.cut.chargedLossPct > 3 ? 'gB' : 'gA')}>{fmt(g.cut.chargedLossPct, 1)}% loss</span>
                </div>
                <div className="small muted">{g.members.join(', ')}</div>
                <table className="tbl compact">
                  <tbody>
                    <tr><td>Stock</td><td className="r mono">{g.rollFormed ? 'roll-formed to length' : g.cut.stock === 'cut-to-length' ? 'cut-to-length' : `${g.cut.bars} bars × ${g.cut.stock} m`}</td></tr>
                    <tr><td>Pieces / splices</td><td className="r mono">{g.cut.pieces} / {g.cut.splices}</td></tr>
                    <tr><td>Net required</td><td className="r mono">{fmt(g.cut.netM, 1)} m · {fmt(g.netKg)} kg</td></tr>
                    <tr><td>Bought</td><td className="r mono">{fmt(g.cut.boughtM, 1)} m · {fmt(g.boughtKg)} kg</td></tr>
                    <tr><td>Scrap (short offcuts + kerf)</td><td className="r mono">{fmt(g.scrapKg)} kg</td></tr>
                    <tr><td>Reusable offcuts → reused</td><td className="r mono">{fmt(g.reusableKg)} → {fmt(g.reusedKg)} kg</td></tr>
                    <tr className="sub"><td>Charged wastage</td><td className="r mono">{fmt(g.lossKg)} kg ({fmt(g.cut.chargedLossPct, 1)}%)</td></tr>
                  </tbody>
                </table>
                {g.cut.alternatives && (
                  <div className="tiny muted">
                    Tried: {g.cut.alternatives.map((t) => `${t.stock} m → ${fmt(t.grossLossPct, 1)}%`).join(' · ')}
                  </div>
                )}
                <BarPlan cut={{ ...g.cut, minReuse: Number(a.min_reuse) || 1 }} />
              </div>
            ))}
          </div>
          <div className="card pad">
            <div className="small">
              <b>Plates:</b> {fmt(s.platesNetKg)} kg net + {PLATE_NEST_PCT}% nesting loss = {fmt(s.platesBoughtKg)} kg. <b>Formulas:</b> gross length = Σ pieces + kerf per cut ({a.cut_method}); charged wastage = scrap + (1 − {a.reuse_share ?? 0}%) × reusable offcuts.
            </div>
          </div>
        </>
      )}

      {tab === 'Welding' && w && (
        <>
          <div className="grid2">
            <div className="card pad">
              <h3>{PROCESSES[w.process].label}</h3>
              <p className="small">{PROCESSES[w.process].note}</p>
              <table className="tbl compact">
                <tbody>
                  <tr><td>Fillet weld {a.fillet_size} mm</td><td className="r mono">{fmt(w.lengths.filletM)} m × {fmt(w.filletKgPerM, 3)} kg/m = {fmt(w.filletKg, 1)} kg</td></tr>
                  <tr><td>Butt weld (single-V, {a.butt_thk} mm)</td><td className="r mono">{fmt(w.lengths.buttM, 1)} m × {fmt(w.buttKgPerM, 3)} kg/m = {fmt(w.buttKg, 1)} kg</td></tr>
                  <tr className="sub"><td>Weld metal deposited</td><td className="r mono">{fmt(w.metal, 1)} kg</td></tr>
                  <tr><td>Deposition efficiency</td><td className="r mono">{fmt(w.p.efficiency * 100)}% → loss {fmt(w.lossPct)}% (stubs, spatter, slag)</td></tr>
                  <tr className="sub"><td>Consumable to buy</td><td className="r mono">{fmt(w.consumable, 1)} kg {w.p.consumable}</td></tr>
                  <tr><td>Arc time</td><td className="r mono">{fmt(w.metal, 1)} ÷ {w.p.depositionKgHr} kg/h = {fmt(w.arcHr, 1)} h</td></tr>
                  <tr><td>Welder hours</td><td className="r mono">{fmt(w.arcHr, 1)} ÷ {fmt(w.p.operatingFactor * 100)}% = {fmt(w.welderHr)} h</td></tr>
                  {w.gasM3 > 0 && <tr><td>Shielding gas</td><td className="r mono">{fmt(w.gasM3, 1)} m³</td></tr>}
                  {w.fluxKg > 0 && <tr><td>SAW flux</td><td className="r mono">{fmt(w.fluxKg, 1)} kg</td></tr>}
                  <tr><td>Power</td><td className="r mono">{fmt(w.kWh)} kWh</td></tr>
                  <tr><td>NDT</td><td className="r mono">{a.ndt} (+{w.ndtPct}% of welding cost)</td></tr>
                </tbody>
              </table>
              <div className="tiny muted">Fillet = s²/2 × 7850 × 1.10 reinforcement. Butt = (t²·tan30° + 2t) × 7850 × 1.10. Weld metal is {fmt((w.metal / s.netKg) * 100, 2)}% of steel weight.</div>
            </div>
            <div className="card pad scroll-x">
              <h3>Process options for the same welds</h3>
              <table className="tbl">
                <thead><tr><th>Process</th><th className="r">Efficiency</th><th className="r">Consumable</th><th className="r">Welder h</th><th className="r">Cost</th></tr></thead>
                <tbody>
                  {processes.map(({ k, x, cost }) => (
                    <tr key={k} className={k === w.process ? 'sub' : ''}>
                      <td>{PROCESSES[k].label}</td>
                      <td className="r mono">{fmt(x.p.efficiency * 100)}%</td>
                      <td className="r mono">{fmt(x.consumable)} kg</td>
                      <td className="r mono">{fmt(x.welderHr)}</td>
                      <td className="r mono">{rs(cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tbl-note">Cost = consumable + flux + gas + power + welder labour, excluding NDT.</div>
            </div>
          </div>
          <div className="card pad scroll-x">
            <h3>Where the weld length comes from</h3>
            <table className="tbl">
              <thead><tr><th>Item</th><th>Formula</th><th>Type</th><th className="r">Length</th></tr></thead>
              <tbody>
                {w.log.map((l, i) => (
                  <tr key={i}><td>{l.item}</td><td className="small mono">{l.formula}</td><td>{l.type}</td><td className="r mono">{fmt(l.m, 1)} m</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Concrete & rebar' && (
        <div className="grid2 wide-left">
          <div className="card pad scroll-x">
            <h3>Concrete, reinforcement & formwork</h3>
            <table className="tbl">
              <thead><tr><th>Element</th><th className="r">Concrete</th><th className="r">Rebar</th><th className="r">Formwork</th></tr></thead>
              <tbody>
                {r.concrete.map((c, i) => (
                  <tr key={i}><td><b>{c.element}</b><div className="tiny muted">{c.note}</div></td><td className="r mono">{fmt(c.vol, 1)} m³</td><td className="r mono">{fmt(c.rebarKg)} kg</td><td className="r mono">{fmt(c.formM2)} m²</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total"><td>Total (net)</td><td className="r mono">{fmt(r.concreteTotals.vol, 1)} m³</td><td className="r mono">{fmt(r.concreteTotals.rebar)} kg</td><td className="r mono">{fmt(r.concreteTotals.form)} m²</td></tr>
              </tfoot>
            </table>
            <div className="tbl-note">
              Concrete wastage {CONCRETE_WASTE}% → {fmt(r.concreteTotals.volWithWaste, 1)} m³. Rebar: laps {fmt(REBAR_LAP_PCT, 1)}% (50d on 12 mm bars per 12 m) + cutting {REBAR_CUT_PCT}% → {fmt(r.concreteTotals.rebarWithWaste)} kg. Also PCC {fmt(r.concreteTotals.pcc, 1)} m³ and excavation {fmt(r.concreteTotals.excav)} m³.
            </div>
          </div>
          <div className="card pad">
            <h3>Site-mix material equivalent</h3>
            <table className="tbl compact">
              <tbody>
                <tr><td>Cement ({a.concrete_grade})</td><td className="r mono">{fmt(r.concreteTotals.volWithWaste * MIX[a.concrete_grade][0])} bags</td></tr>
                <tr><td>Cement (PCC M10)</td><td className="r mono">{fmt(r.concreteTotals.pcc * 4.4)} bags</td></tr>
                <tr><td>Sand (M-sand)</td><td className="r mono">{fmt(r.concreteTotals.volWithWaste * MIX[a.concrete_grade][1], 1)} m³</td></tr>
                <tr><td>20 mm aggregate</td><td className="r mono">{fmt(r.concreteTotals.volWithWaste * MIX[a.concrete_grade][2], 1)} m³</td></tr>
              </tbody>
            </table>
            <div className="tiny muted">Indicative design-mix values. RMC is priced per m³ in the BOQ.</div>
            {r.masonry && (
              <>
                <h3>Masonry</h3>
                <table className="tbl compact">
                  <tbody>
                    <tr><td>External walls</td><td className="r mono">{fmt(r.masonry.extA)} m²</td></tr>
                    <tr><td>Internal walls</td><td className="r mono">{fmt(r.masonry.intA)} m²</td></tr>
                    <tr><td>Wall volume</td><td className="r mono">{fmt(r.masonry.vol, 1)} m³</td></tr>
                    <tr><td>{r.masonry.unitName} (+5% breakage)</td><td className="r mono">{fmt(r.masonry.units)}</td></tr>
                    <tr><td>Mortar</td><td className="r mono">{fmt(r.masonry.mortar, 1)} m³</td></tr>
                    <tr><td>Plaster area</td><td className="r mono">{fmt(r.masonry.plasterA)} m²</td></tr>
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'Envelope & paint' && (
        <div className="grid2">
          {r.envelope ? (
            <div className="card pad">
              <h3>Roof & walls</h3>
              <table className="tbl compact">
                <tbody>
                  <tr><td>Roof area (incl. 6% laps)</td><td className="r mono">{fmt(r.envelope.roofA)} m²</td></tr>
                  <tr><td>Skylights</td><td className="r mono">{fmt(r.envelope.sky)} m²</td></tr>
                  <tr><td>Wall cladding</td><td className="r mono">{fmt(r.envelope.cladA)} m²</td></tr>
                  <tr><td>Brick wall (dado {fmt(r.envelope.dadoH, 1)} m)</td><td className="r mono">{fmt(r.envelope.brickVol, 1)} m³</td></tr>
                  <tr><td>Rolling shutters</td><td className="r mono">{fmt(r.envelope.shutterA)} m²</td></tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card pad muted">Roof & wall sheeting applies to industrial buildings and warehouses.</div>
          )}
          {r.paint ? (
            <div className="card pad">
              <h3>Steel surface protection</h3>
              <table className="tbl compact">
                <tbody>
                  <tr><td>Paintable surface area</td><td className="r mono">{fmt(r.paint.area)} m²</td></tr>
                  {r.paint.galvKg && <tr><td>Galvanising</td><td className="r mono">{fmt(r.paint.galvKg)} kg</td></tr>}
                  {(r.paint.coats || []).map((c) => (
                    <tr key={c.name}><td>{c.name} × {c.coats}</td><td className="r mono">{fmt(c.litres)} L</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="tiny muted">Area = Σ section perimeter × length + plates. Litres = area × coats ÷ coverage, plus {PAINT_SPRAY_LOSS}% spray and handling loss.</div>
            </div>
          ) : (
            <div className="card pad muted">No structural steel to protect.</div>
          )}
        </div>
      )}

      {tab === 'BOQ & cost' && (
        <div className="card pad scroll-x">
          <table className="tbl">
            <thead><tr><th>Item</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {cats.map(([c]) => (
                <BoqCat key={c} cat={c} rows={r.boq.filter((b) => b.cat === c)} total={r.cost.byCat[c]} />
              ))}
              <tr className="sub"><td colSpan={4}>Direct cost</td><td className="r mono">{rs(r.cost.direct)}</td></tr>
              <tr><td colSpan={4}>Overhead @ {a.overhead_pct}%</td><td className="r mono">{rs(r.cost.overhead)}</td></tr>
              <tr><td colSpan={4}>Contingency @ {a.contingency_pct}%</td><td className="r mono">{rs(r.cost.contingency)}</td></tr>
              <tr><td colSpan={4}>Margin @ {a.margin_pct}%</td><td className="r mono">{rs(r.cost.margin)}</td></tr>
              <tr><td colSpan={4}>GST @ {a.gst_pct}%</td><td className="r mono">{rs(r.cost.gst)}</td></tr>
              <tr className="total"><td colSpan={4}>GRAND TOTAL · ₹{fmt(r.cost.perSqft)}/sq ft</td><td className="r mono">{rs(r.cost.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Rates' && (
        <div className="card pad scroll-x">
          <div className="tbl-note">
            <b>These are placeholder rates.</b> Replace them with your current Tamil Nadu SOR or supplier quotes. Every change recalculates the whole estimate instantly.
          </div>
          <table className="tbl">
            <thead><tr><th>Item</th><th>Unit</th><th className="r">Rate</th></tr></thead>
            <tbody>
              {Object.entries(rates).map(([k, v]) => (
                <tr key={k}>
                  <td>{v.label}</td>
                  <td className="muted">{v.unit}</td>
                  <td className="r">
                    <input className="cell" aria-label={v.label + ' rate'} style={{ width: 100 }} type="number" value={v.value} onChange={(e) => setRates({ ...rates, [k]: { ...v, value: e.target.value === '' ? 0 : Number(e.target.value) } })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'AI expert review' && (
        <div className="card pad">
          <h3>Senior engineer review</h3>
          <p className="small muted">The engine's numbers and checks go to the AI. It suggests missing scope, risky assumptions, the next questions to ask the client, and ways to save cost and wastage.</p>
          <button className="btn primary" disabled={review.busy} onClick={runReview}>
            {review.busy ? 'Reviewing…' : '🤖 Run AI expert review'}
          </button>
          {review.err && <p className="error-text">{review.err}</p>}
          {review.text && <div className="review">{review.text}</div>}
          <details className="small">
            <summary>What gets sent</summary>
            <pre className="mono">{summaryText()}</pre>
          </details>
        </div>
      )}
    </div>
  )
}

function BoqCat({ cat, rows, total }) {
  return (
    <>
      <tr className="cat-row"><td colSpan={4}>{cat}</td><td className="r mono">{rs(total)}</td></tr>
      {rows.map((b, i) => (
        <tr key={i}>
          <td>
            {b.item}
            {b.note && <div className="tiny muted">{b.note}</div>}
          </td>
          <td className="r mono">{fmt(b.qty, b.qty < 10 ? 2 : 0)}</td>
          <td>{b.unit}</td>
          <td className="r mono">{fmt(b.rate, Math.abs(b.rate) < 100 ? 2 : 0)}</td>
          <td className={'r mono' + (b.amount < 0 ? ' neg' : '')}>{rs(b.amount)}</td>
        </tr>
      ))}
    </>
  )
}
