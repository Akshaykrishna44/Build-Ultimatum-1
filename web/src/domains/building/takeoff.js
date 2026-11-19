// ─────────────────────────────────────────────────────────────
// Building & industry takeoff engine.
// Answers → geometry → members → cutting plans → welding → foundations → envelope → BOQ → cost.
// Pure functions, no AI: every number can be traced to a formula shown in the UI.
// ─────────────────────────────────────────────────────────────
import { SECTIONS, plateKg } from './sections.js'
import { cutWithPolicy } from './cutting.js'
import { weldingCalc } from './welding.js'
import { CLASS_INFO, klass, isSteelRoof, hasSteelColumns, isRCCFrame, isShed } from './questions.js'

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const KERF = { bandsaw: 2, coldsaw: 3, gas: 4, plasma: 3 }
const SOIL_SIZE = { hard: 0.85, medium: 1, soft: 1.25 }
const BASE_PLATE = { light: [350, 350, 20], medium: [450, 450, 25], heavy: [600, 600, 32], house: [300, 300, 16] }
const ANCHORS = { light: 4, medium: 6, heavy: 8, house: 4 }
const REBAR_KG_M3 = { footing: 70, pedestal: 140, plinth: 120, column: 180, beam: 140, slab: 90, grade_slab: 45, stair: 100, raft: 110, pile: 50 }
const FORM_M2_M3 = { footing: 1.6, pedestal: 6.7, plinth: 7.5, column: 10, beam: 9, slab: 8, grade_slab: 0.3, stair: 7, raft: 0.8, pile: 0 }
const MASONRY = {
  brick: { ext: 0.23, int: 0.115, unitsM3: 500, mortarM3: 0.25, unit: 'bricks', rate: 'brick' },
  aac: { ext: 0.2, int: 0.1, unitsM3: 41.7, mortarM3: 0.08, unit: 'blocks', rate: 'aac' },
  block: { ext: 0.2, int: 0.1, unitsM3: 62.5, mortarM3: 0.15, unit: 'blocks', rate: 'block' },
}
export const CONCRETE_WASTE = 2.5
export const REBAR_LAP_PCT = ((50 * 12) / 12000) * 100 // lap 50d on 12 mm bars per 12 m length = 5%
export const REBAR_CUT_PCT = 3
export const PLATE_NEST_PCT = 8
export const PAINT_SPRAY_LOSS = 30

function dims(s) {
  const [x, y] = String(s || '300×300').split('×').map(Number)
  return [x / 1000, y / 1000]
}

// Sensible engineering ranges for the calculation. Values outside are capped and reported, so a typo
// (e.g. 100000 m) can never freeze or crash the page. Blank / 0 / negative falls back to the lower limit.
export const LIMITS = {
  length: [3, 1000, 'm'], width: [3, 300, 'm'], eave_height: [2, 40, 'm'], floor_height: [2.4, 10, 'm'], floors: [1, 60, 'floors'],
  spans: [1, 20, 'spans'], bay: [3, 15, 'm'], purlin_spacing: [0.5, 3, 'm'], girt_spacing: [0.5, 3, 'm'], grid: [2, 15, 'm'],
  mezz_area: [0, 300000, 'm²'], shutters: [0, 200, 'nos'], min_reuse: [0, 12, 'm'], footing_size: [0.6, 8, 'm'], footing_depth: [0.2, 3, 'm'],
  floor_thk: [75, 600, 'mm'], slab_thk: [75, 400, 'mm'], skylight_pct: [0, 50, '%'], openings: [0, 80, '%'], reuse_share: [0, 100, '%'],
}

export function clampAnswers(a, checks = []) {
  const out = { ...a }
  for (const [k, [lo, hi, unit]] of Object.entries(LIMITS)) {
    if (!(k in out)) continue
    const raw = out[k]
    if (raw === '' || raw === null || raw === undefined) continue
    const v = Number(raw)
    if (!Number.isFinite(v) || v < lo) {
      out[k] = lo
      if (Number.isFinite(v) && lo > 0) checks.push({ level: 'warn', text: `${k.replace(/_/g, ' ')} ${raw} ${unit} is below the usable range; calculated with ${lo} ${unit}.` })
    } else if (v > hi) {
      out[k] = hi
      checks.push({ level: 'warn', text: `${k.replace(/_/g, ' ')} ${raw} ${unit} is above the range this engine handles; calculated with ${hi} ${unit}. Check the value.` })
    }
  }
  return out
}

export function compute(aIn, rates) {
  const checks = []
  const a = clampAnswers(aIn, checks)
  const R = (key) => n(rates[key]?.value)
  const k = klass(a)
  const L = n(a.length)
  const W = n(a.width)
  const footprint = L * W
  const floors = isShed(a) ? 1 : Math.max(1, n(a.floors))
  const builtUp = footprint * floors + n(a.mezz_area)
  const boq = []
  const add = (cat, item, qty, unit, rate, note = '') => {
    if (!(qty > 0) && rate >= 0) return
    boq.push({ cat, item, qty, unit, rate, amount: qty * rate, note })
  }
  const out = { k, classInfo: CLASS_INFO[k], geom: { L, W, footprint, floors, builtUp }, steel: null, welding: null, paint: null, concrete: [], masonry: null, envelope: null, boq, checks }

  // ── STEEL STRUCTURE ────────────────────────────────────────
  let steelCols = 0
  let colPositions = 0
  let E = isShed(a) ? n(a.eave_height) : floors * n(a.floor_height)
  if (isSteelRoof(a)) {
    const slope = n(a.roof_slope) || 10
    const th = Math.atan(1 / slope)
    const spans = Math.max(1, Math.round(n(a.spans)) || 1)
    const spanW = W / spans
    const nBays = Math.max(1, Math.round(L / Math.max(n(a.bay), 1)))
    const bay = L / nBays
    const frames = nBays + 1
    const half = spanW / 2 / Math.cos(th)
    const rise = (spanW / 2) * Math.tan(th)
    const gradeF = a.steel_grade === 'E350' ? 0.9 : 1
    Object.assign(out.geom, { spans, spanW, nBays, bay, frames, half, rise, slopeDeg: (th * 180) / Math.PI, E })

    const members = []
    colPositions = frames * (spans + 1)
    if (hasSteelColumns(a)) {
      steelCols = colPositions
      members.push({ id: 'col', label: 'Main columns', section: a.col_section, pieces: [{ mark: 'Column', length: E, qty: steelCols }], ends: 2, gradeF, welded: true })
      const ewc = 2 * Math.max(0, Math.ceil(W / 6) - 1 - (spans - 1))
      if (ewc > 0) members.push({ id: 'ewc', label: 'End-wall wind columns', section: 'ISMB 250', pieces: [{ mark: 'Wind column', length: E + rise / 2, qty: ewc }], ends: 2, gradeF: 1, welded: true })
      steelCols += ewc
    }
    members.push({ id: 'raf', label: 'Rafters (roof beams)', section: a.raf_section, pieces: [{ mark: 'Half rafter', length: half, qty: frames * spans * 2 }], ends: 2, gradeF, welded: true })
    const sp = Math.max(n(a.purlin_spacing), 0.5)
    const linesHalf = Math.ceil(half / sp) + 1
    const purlinLines = linesHalf * 2 * spans
    members.push({ id: 'pur', label: 'Roof purlins', section: a.purlin_section, pieces: [{ mark: 'Purlin (bay + 10% lap)', length: bay * 1.1, qty: purlinLines * nBays }], ends: 0, gradeF: 1, cleats: purlinLines * frames })
    let girtRows = 0
    if (hasSteelColumns(a)) {
      const cladH = a.wall_clad === 'brick' ? 0 : a.wall_clad === 'dado' ? Math.max(E - 3, 0) : E
      girtRows = Math.ceil(cladH / Math.max(n(a.girt_spacing), 0.5))
      if (girtRows > 0) {
        const panels = Math.ceil(W / 6)
        members.push({ id: 'girt', label: 'Wall girts', section: a.girt_section, pieces: [
          { mark: 'Side girt', length: bay * 1.1, qty: girtRows * 2 * nBays },
          { mark: 'End girt', length: (W / panels) * 1.1, qty: girtRows * 2 * panels },
        ], ends: 0, gradeF: 1, cleats: girtRows * (2 * frames + 2 * panels) })
      }
    }
    const interval = ['IV', 'V'].includes(a.seismic) ? 4 : 5
    const braced = Math.min(nBays, Math.max(2, Math.ceil(nBays / interval)))
    const brPieces = [{ mark: 'Roof X-brace', length: Math.hypot(bay, half / 2), qty: braced * spans * 8 }]
    if (hasSteelColumns(a)) brPieces.push({ mark: 'Wall X-brace', length: Math.hypot(bay, E), qty: braced * 2 * 2 })
    members.push({ id: 'brace', label: `Bracing (${braced} braced bays)`, section: a.bracing, pieces: brPieces, ends: 2, gradeF: 1, gussetWeld: 0.15 })
    const crane = n(a.crane)
    if (crane > 0) members.push({ id: 'cg', label: `Crane girders (${crane} t)`, section: a.crane_section, pieces: [{ mark: 'Crane girder', length: bay, qty: nBays * 2 }], ends: 2, gradeF: 1, welded: true, capWeld: true })

    // Group pieces by section and run the cutting optimiser
    const groups = {}
    for (const m of members) {
      const s = SECTIONS[m.section]
      if (!s) continue
      m.kgPerM = s.kg * m.gradeF
      m.netM = m.pieces.reduce((t, p) => t + p.length * p.qty, 0)
      m.netKg = m.netM * m.kgPerM
      m.count = m.pieces.reduce((t, p) => t + p.qty, 0)
      const key = m.section + (m.gradeF !== 1 ? ' (E350)' : '')
      groups[key] = groups[key] || { key, section: m.section, s, kgPerM: m.kgPerM, pieces: [], members: [] }
      groups[key].pieces.push(...m.pieces.map((p) => ({ ...p, mark: m.label + ' · ' + p.mark })))
      groups[key].members.push(m.label)
    }
    const policy = a.stock_policy || 'std'
    const reuseShare = a.stock_policy === 'ctl' ? 0 : Math.min(Math.max(n(a.reuse_share), 0), 100) / 100
    for (const g of Object.values(groups)) {
      // Cold-formed sections are roll-formed to the exact length ordered
      g.rollFormed = g.s.family === 'Z'
      g.cut = cutWithPolicy(g.pieces, { policy: g.rollFormed ? 'ctl' : policy, std: 12, kerf: KERF[a.cut_method] ?? 3, minReuse: n(a.min_reuse) || 1, reuseShare })
      g.netKg = g.cut.netM * g.kgPerM
      g.boughtKg = g.cut.boughtM * g.kgPerM
      g.scrapKg = g.cut.scrapM * g.kgPerM
      g.reusableKg = g.cut.reusableM * g.kgPerM
      g.reusedKg = g.cut.reusedM * g.kgPerM
      g.lossKg = g.cut.chargedLossM * g.kgPerM
      g.rateKey = g.s.family === 'Z' ? 'steel_cf' : g.s.family === 'R' ? 'steel_rod' : 'steel_rolled'
    }
    const G = Object.values(groups)
    const memberNetKg = G.reduce((t, g) => t + g.netKg, 0)
    const mainNetKg = members.filter((m) => ['col', 'raf', 'ewc', 'cg'].includes(m.id)).reduce((t, m) => t + (m.netKg || 0), 0)

    // Plates, connections, extras
    const bp = BASE_PLATE[k] || BASE_PLATE.medium
    const basePlatesKg = hasSteelColumns(a) ? plateKg(bp[0], bp[1], bp[2], colPositions) + plateKg(300, 300, 16, steelCols - colPositions) : 0
    const connKg = (memberNetKg * n(a.conn_pct)) / 100
    const mezzKg = n(a.mezz_area) * 40
    const railKg = crane > 0 ? 2 * L * (crane <= 20 ? 30 : 52) : 0
    const bracketKg = crane > 0 ? 2 * frames * (crane <= 10 ? 60 : crane <= 20 ? 120 : 200) : 0
    const platesNetKg = basePlatesKg + connKg + bracketKg
    const platesBoughtKg = platesNetKg * (1 + PLATE_NEST_PCT / 100)
    const netKg = memberNetKg + platesNetKg + mezzKg + railKg
    const boughtKg = G.reduce((t, g) => t + g.boughtKg, 0) + platesBoughtKg + mezzKg + railKg
    const lossKg = G.reduce((t, g) => t + g.lossKg, 0) + (platesBoughtKg - platesNetKg)
    const perM2 = footprint > 0 ? netKg / footprint : 0
    out.steel = { members, groups: G, memberNetKg, mainNetKg, basePlatesKg, connKg, mezzKg, railKg, bracketKg, platesNetKg, platesBoughtKg, netKg, boughtKg, lossKg, lossPct: boughtKg > 0 ? (lossKg / boughtKg) * 100 : 0, perM2, policy, reuseShare, braced, purlinLines, girtRows, steelCols }

    checks.push({ level: 'info', text: 'Section sizes are typical presets for this industry class, not a structural design. Final members must be designed to IS 800 / IS 875 by a structural engineer.' })
    const range = CLASS_INFO[k]?.steel
    if (range && range[1] > 0) {
      if (perM2 < range[0]) checks.push({ level: 'warn', text: `Steel intensity ${perM2.toFixed(1)} kg/m² is below the typical ${range[0]}–${range[1]} kg/m² for ${CLASS_INFO[k].label}. Check the sections are not undersized.` })
      else if (perM2 > range[1]) checks.push({ level: 'warn', text: `Steel intensity ${perM2.toFixed(1)} kg/m² is above the typical ${range[0]}–${range[1]} kg/m² for ${CLASS_INFO[k].label}. Consider PEB tapered sections, E350 steel or more spans.` })
      else checks.push({ level: 'ok', text: `Steel intensity ${perM2.toFixed(1)} kg/m² is within the typical ${range[0]}–${range[1]} kg/m² for ${CLASS_INFO[k].label}.` })
    }
    if (bay < 5.5 || bay > 9.5) checks.push({ level: 'warn', text: `Bay spacing ${bay.toFixed(2)} m is outside the economic 6–9 m range.` })
    if (spanW > 35 && a.system !== 'peb') checks.push({ level: 'warn', text: `A ${spanW.toFixed(1)} m clear span in conventional steel gets very heavy. Use PEB or add interior columns.` })
    if (n(a.purlin_spacing) > 1.8) checks.push({ level: 'warn', text: 'Purlin spacing above 1.8 m needs thicker sheets or deeper purlins.' })
    if (crane > 0 && E < 7) checks.push({ level: 'warn', text: `Eave height ${E} m is low for a crane. Check hook height + crane depth + clearance (usually ≥ 8 m).` })
    if (a.weld_process === 'saw' && a.fab_location === 'site') checks.push({ level: 'warn', text: 'SAW is a shop process. For site welding use SMAW or FCAW.' })
    if (a.weld_process === 'gmaw' && a.fab_location === 'site') checks.push({ level: 'info', text: 'MIG at site needs wind screens, because shielding gas blows away.' })
    const worst = G.slice().sort((x, y) => y.cut.chargedLossPct - x.cut.chargedLossPct)[0]
    if (worst && worst.cut.chargedLossPct > 8) checks.push({ level: 'warn', text: `${worst.key}: cutting loss ${worst.cut.chargedLossPct.toFixed(1)}%. Try "Best of 6/9/10.5/12 m" or cut-to-length, or reuse offcuts.` })

    // ── WELDING ──
    let fillet = 0
    let butt = 0
    const wlog = []
    for (const m of members) {
      const s = SECTIONS[m.section]
      if (!s) continue
      if (m.welded && (s.family === 'I' || s.family === 'C')) {
        const endWeld = (4 * s.b + 2 * s.h) / 1000
        const v = endWeld * m.ends * m.count
        fillet += v
        wlog.push({ item: `${m.label}: end connections`, formula: `(4×${s.b} + 2×${s.h}) mm × ${m.ends} ends × ${m.count}`, m: v, type: 'fillet' })
      }
      if (m.gussetWeld) {
        const v = m.gussetWeld * 2 * m.count
        fillet += v
        wlog.push({ item: `${m.label}: gusset welds`, formula: `0.15 m × 2 ends × ${m.count}`, m: v, type: 'fillet' })
      }
      if (m.cleats) {
        const v = m.cleats * 0.2
        fillet += v
        wlog.push({ item: `${m.label}: cleats`, formula: `${m.cleats} cleats × 0.2 m`, m: v, type: 'fillet' })
      }
      if (m.capWeld) {
        const v = 2 * m.netM
        fillet += v
        wlog.push({ item: `${m.label}: cap channel to beam`, formula: `2 × ${m.netM.toFixed(0)} m`, m: v, type: 'fillet' })
      }
    }
    for (const g of G) {
      if (g.cut.splices > 0 && (g.s.family === 'I' || g.s.family === 'C')) {
        const v = g.cut.splices * ((2 * g.s.b + g.s.h) / 1000)
        butt += v
        wlog.push({ item: `${g.key}: splices (full penetration)`, formula: `${g.cut.splices} splices × (2×${g.s.b} + ${g.s.h}) mm`, m: v, type: 'butt' })
      }
    }
    if (a.built_up === 'yes') {
      const lenMain = members.filter((m) => ['col', 'raf'].includes(m.id)).reduce((t, m) => t + m.netM, 0)
      const v = lenMain * 2 * n(a.weld_sides || 1)
      fillet += v
      wlog.push({ item: 'Built-up members: flange-to-web', formula: `${lenMain.toFixed(0)} m × 2 flanges × ${a.weld_sides || 1} side(s)`, m: v, type: 'fillet' })
    }
    if (mezzKg) {
      const v = n(a.mezz_area) * 0.8
      fillet += v
      wlog.push({ item: 'Mezzanine connections', formula: `${a.mezz_area} m² × 0.8 m/m²`, m: v, type: 'fillet' })
    }
    if (bracketKg) {
      const v = 2 * frames * 1.5
      fillet += v
      wlog.push({ item: 'Crane brackets', formula: `${2 * frames} brackets × 1.5 m`, m: v, type: 'fillet' })
    }
    const misc = fillet * 0.1
    fillet += misc
    wlog.push({ item: 'Stiffeners, haunches, misc (+10%)', formula: '10% of fillet length', m: misc, type: 'fillet' })
    const wc = weldingCalc({ filletM: fillet, buttM: butt }, { process: a.weld_process || 'gmaw', filletSize: n(a.fillet_size) || 6, buttThk: n(a.butt_thk) || 12 })
    const ndtPct = { visual: 0, dpt: 2, ut10: 5, ut100: 12 }[a.ndt] ?? 0
    out.welding = { ...wc, log: wlog, ndtPct }
    if (netKg > 0 && wc.metal / netKg > 0.025) checks.push({ level: 'info', text: `Weld metal is ${((wc.metal / netKg) * 100).toFixed(2)}% of steel weight (typical 0.8–2%). Check the fillet size.` })

    // ── PAINT / PROTECTION ──
    let area = G.reduce((t, g) => t + g.cut.netM * g.s.surf, 0)
    area += (platesNetKg / STEEL_KG_PER_M3) / 0.012 * 2 + (mezzKg / 1000) * 25 + (railKg / 1000) * 15
    const paintSys = a.paint || 'primer_enamel'
    const p = { area, sys: paintSys, prep: a.surface_prep }
    if (paintSys === 'galv') p.galvKg = netKg
    else if (paintSys === 'epoxy') p.coats = [{ name: 'Epoxy zinc primer', cov: 7, coats: 1, rate: 'epoxy' }, { name: 'Epoxy MIO intermediate', cov: 7, coats: 1, rate: 'epoxy' }, { name: 'PU / epoxy finish', cov: 8, coats: 1, rate: 'epoxy' }]
    else p.coats = [{ name: 'Primer', cov: 8, coats: 1, rate: 'primer' }, { name: 'Enamel finish', cov: 10, coats: 2, rate: 'enamel' }]
    if (p.coats) p.coats = p.coats.map((c) => ({ ...c, litres: ((area * c.coats) / c.cov) * (1 + PAINT_SPRAY_LOSS / 100) }))
    out.paint = p

    // ── BOQ: steel ──
    for (const g of G) {
      const prem = g.key.includes('E350') ? 1 + R('e350_premium') / 100 : 1
      const ctl = policy === 'ctl' && !g.rollFormed ? 1 + R('ctl_premium') / 100 : 1
      const how = g.rollFormed ? 'roll-formed to length' : g.cut.stock === 'cut-to-length' ? 'cut-to-length from mill' : `${g.cut.bars} × ${g.cut.stock} m bars, offcut ${g.cut.grossLossPct.toFixed(1)}%`
      add('Structural steel', `Supply ${g.key}`, g.boughtKg, 'kg', R(g.rateKey) * prem * ctl, `net ${fmt(g.netKg)} kg; ${how}`)
    }
    add('Structural steel', 'Plates: base, connections, brackets', platesBoughtKg, 'kg', R('steel_plate'), `net ${fmt(platesNetKg)} kg + ${PLATE_NEST_PCT}% nesting loss`)
    if (mezzKg) add('Structural steel', 'Mezzanine steel (≈40 kg/m²)', mezzKg, 'kg', R('steel_rolled'))
    if (railKg) add('Structural steel', 'Crane rails', railKg, 'kg', R('steel_rolled'))
    const scrapSaleKg = G.reduce((t, g) => t + g.lossKg, 0)
    const reusedKg = G.reduce((t, g) => t + g.reusedKg, 0)
    add('Structural steel', 'Credit: offcuts sold as scrap', scrapSaleKg, 'kg', -R('scrap_credit'), 'offcuts not reused')
    add('Structural steel', 'Credit: offcuts reused as cleats/gussets (saves plate)', reusedKg, 'kg', -R('steel_plate'), `${(reuseShare * 100).toFixed(0)}% of reusable offcuts`)
    if (hasSteelColumns(a)) add('Structural steel', 'Anchor bolt sets', steelCols * (ANCHORS[k] + (crane > 0 ? 2 : 0)), 'nos', R('bolts'), `${ANCHORS[k] + (crane > 0 ? 2 : 0)} bolts per column`)
    add('Fabrication & erection', `Fabrication: ${a.fab_location === 'site' ? 'site' : 'shop'} (cut, fit-up, handling, excl. welding)`, netKg, 'kg', R(a.fab_location === 'site' ? 'fab_site' : 'fab_shop'))
    add('Fabrication & erection', 'Erection (crane, alignment, bolting)', netKg, 'kg', R('erection'))
    const wk = 'weld_' + (a.weld_process || 'gmaw')
    const weldItems = [
      [`Welding consumable: ${wc.p.consumable}`, wc.consumable, 'kg', R(wk), `weld metal ${fmt(wc.metal)} kg ÷ ${(wc.p.efficiency * 100).toFixed(0)}% efficiency`],
      ['SAW flux', wc.fluxKg, 'kg', R('saw_flux'), '≈1.2 kg per kg wire'],
      ['Shielding gas', wc.gasM3, 'm³', R('gas'), `${wc.p.gasLpm} L/min × arc time`],
      ['Welding power', wc.kWh, 'kWh', R('power'), `${wc.p.volts} V × ${wc.p.amps} A × arc time ÷ 80%`],
      ['Welder labour', wc.welderHr, 'h', R('welder'), `arc ${wc.arcHr.toFixed(0)} h ÷ ${(wc.p.operatingFactor * 100).toFixed(0)}% operating factor`],
    ]
    let weldCost = 0
    for (const [item, q, u, r, note] of weldItems) {
      if (q > 0) {
        add('Welding', item, q, u, r, note)
        weldCost += q * r
      }
    }
    if (ndtPct) add('Welding', `NDT (${a.ndt})`, 1, 'lot', (weldCost * ndtPct) / 100, `${ndtPct}% of welding cost`)
    if (paintSys === 'galv') add('Surface protection', 'Hot-dip galvanising', netKg, 'kg', R('galv'))
    else {
      if (a.surface_prep === 'sa25') add('Surface protection', 'Blasting Sa 2½', area, 'm²', R('blast'))
      for (const c of p.coats) add('Surface protection', `${c.name} (${c.coats} coat${c.coats > 1 ? 's' : ''})`, c.litres, 'L', R(c.rate), `${fmt(area)} m² ÷ ${c.cov} m²/L + ${PAINT_SPRAY_LOSS}% spray loss`)
      add('Surface protection', 'Painting labour', area, 'm²', R('paint_labour'))
    }
  }

  // ── RCC FRAME (house / commercial / hybrid columns) ───────
  const conc = []
  const grade = a.concrete_grade || 'M25'
  const addConc = (element, vol, kind, note = '') => {
    if (vol > 0) conc.push({ element, vol, kind, rebarKg: vol * REBAR_KG_M3[kind], formM2: vol * FORM_M2_M3[kind], note })
  }
  let footings = steelCols
  if (isRCCFrame(a)) {
    const grid = Math.max(n(a.grid), 2)
    const nx = Math.ceil(L / grid)
    const ny = Math.ceil(W / grid)
    const colsPF = (nx + 1) * (ny + 1)
    const h = n(a.floor_height) || 3.2
    const [cb, cd] = dims(a.rcc_col)
    const [bb, bd] = dims(a.rcc_beam)
    const st = n(a.slab_thk) / 1000
    const beamLen = (ny + 1) * L + (nx + 1) * W
    addConc('Columns', colsPF * floors * cb * cd * h, 'column', `${colsPF} cols × ${floors} floors × ${a.rcc_col} × ${h} m`)
    addConc('Beams', beamLen * bb * (bd - st) * floors, 'beam', `${fmt(beamLen)} m/floor × ${a.rcc_beam} (below slab)`)
    addConc('Plinth beams', beamLen * 0.23 * 0.45, 'plinth', `${fmt(beamLen)} m × 230×450`)
    addConc('Slabs', L * W * st * floors, 'slab', `${fmt(L * W)} m² × ${a.slab_thk} mm × ${floors}`)
    addConc('Staircase', Math.max(floors - 1, 0) * 2.5 + 1.0, 'stair', '≈2.5 m³ per flight + headroom')
    footings = colsPF
    Object.assign(out.geom, { grid, nx, ny, colsPF })

    // masonry
    const mt = MASONRY[a.wall_type] || MASONRY.brick
    const open = n(a.openings) / 100
    const per = 2 * (L + W)
    const extA = per * h * floors * (1 - open)
    const intA = per * 1.0 * h * floors * (1 - open / 2)
    const vol = extA * mt.ext + intA * mt.int
    const units = vol * mt.unitsM3 * 1.05
    const plasterA = extA * 2 + intA * 2
    out.masonry = { type: a.wall_type, extA, intA, vol, units, unitName: mt.unit, mortar: vol * mt.mortarM3, plasterA }
    add('Masonry & plaster', `${mt.unit[0].toUpperCase() + mt.unit.slice(1)} (incl. 5% breakage)`, units, 'nos', R(mt.rate), `${fmt(vol)} m³ wall × ${mt.unitsM3}/m³`)
    add('Masonry & plaster', 'Mortar', vol * mt.mortarM3, 'm³', R('mortar'), `${mt.mortarM3} m³ per m³ wall`)
    add('Masonry & plaster', 'Masonry labour', vol, 'm³', R('masonry_labour'))
    add('Masonry & plaster', 'Plastering, both faces', plasterA, 'm²', R('plaster'))
  }
  if (a.system === 'hybrid') {
    const [cb, cd] = dims(a.rcc_col)
    addConc('RCC columns (hybrid)', colPositions * cb * cd * E, 'column', `${colPositions} cols × ${a.rcc_col} × ${E} m`)
    footings = colPositions
  }

  // ── FOUNDATIONS & FLOOR ─────────────────────────────────────
  const fs = n(a.footing_size) * (SOIL_SIZE[a.soil] ?? 1)
  const fd = n(a.footing_depth)
  let excav = 0
  let pcc = 0
  if (a.footing_type === 'raft') {
    const t = { light: 0.3, medium: 0.45, heavy: 0.6, house: 0.3 }[k]
    addConc('Raft', footprint * t, 'raft', `${fmt(footprint)} m² × ${t} m`)
    pcc += footprint * 0.075
    excav += footprint * (t + 1.0)
  } else {
    addConc(a.footing_type === 'pile' ? 'Pile caps' : 'Isolated footings', footings * fs * fs * fd, 'footing', `${footings} × ${fs.toFixed(2)}² × ${fd} m (soil factor ${SOIL_SIZE[a.soil] ?? 1})`)
    pcc += footings * (fs + 0.3) ** 2 * 0.075
    excav += footings * (fs + 0.6) ** 2 * (fd + 1.0)
    if (a.footing_type === 'pile') {
      const pileM = footings * 2 * 15
      add('Foundations', 'Bored piles 500 mm (2 per cap × 15 m)', pileM, 'm', R('pile'), 'Length to be confirmed by soil report')
      addConc('Pile shafts (reinforcement only)', 0, 'pile')
    }
  }
  if (hasSteelColumns(a)) {
    const bp = BASE_PLATE[k] || BASE_PLATE.medium
    const ped = bp[0] / 1000 + 0.15
    addConc('Pedestals', steelCols * ped * ped * 1.0, 'pedestal', `${steelCols} × ${ped.toFixed(2)}² × 1.0 m`)
  }
  if (isShed(a)) {
    addConc('Plinth beams', 2 * (L + W) * 0.3 * 0.45, 'plinth', 'perimeter × 300×450')
    const ft = n(a.floor_thk) / 1000
    addConc('Grade slab', footprint * ft, 'grade_slab', `${fmt(footprint)} m² × ${a.floor_thk} mm`)
    pcc += footprint * 0.1
    const fin = { fm2: ['FM2 / VDF floor finish', 'fm2'], epoxy: ['Epoxy floor coating', 'epoxy_floor'], tiles: ['Industrial tiles', 'tiles'] }[a.floor_type]
    if (fin) add('Floor', fin[0], footprint, 'm²', R(fin[1]))
  }
  out.concrete = conc
  const totVol = conc.reduce((t, c) => t + c.vol, 0)
  const totRebar = conc.reduce((t, c) => t + c.rebarKg, 0)
  const totForm = conc.reduce((t, c) => t + c.formM2, 0)
  out.concreteTotals = { vol: totVol, volWithWaste: totVol * (1 + CONCRETE_WASTE / 100), rebar: totRebar, rebarWithWaste: totRebar * (1 + (REBAR_LAP_PCT + REBAR_CUT_PCT) / 100), form: totForm, pcc, excav }
  add('Foundations', 'Excavation', excav, 'm³', R('excavation'))
  add('Foundations', 'PCC M10 levelling course', pcc, 'm³', R('pcc'))
  add('RCC', `Concrete ${grade} (incl. ${CONCRETE_WASTE}% wastage)`, totVol * (1 + CONCRETE_WASTE / 100), 'm³', R(grade), `${fmt(totVol)} m³ net`)
  add('RCC', `Reinforcement ${a.rebar_grade || 'Fe500D'} (incl. laps ${REBAR_LAP_PCT.toFixed(0)}% + cutting ${REBAR_CUT_PCT}%)`, out.concreteTotals.rebarWithWaste, 'kg', R('rebar'), `${fmt(totRebar)} kg net`)
  add('RCC', 'Formwork / shuttering', totForm, 'm²', R('formwork'))
  if (a.soil === 'soft' && a.footing_type === 'isolated') checks.push({ level: 'warn', text: 'Soft soil with isolated footings: get a soil test. Pile or raft foundations are often needed.' })

  // ── ENVELOPE (sheds) ───────────────────────────────────────
  if (isShed(a) && out.geom.half) {
    const roofA = L * 2 * out.geom.half * out.geom.spans * 1.06
    const sky = (roofA * n(a.skylight_pct)) / 100
    const shutterA = n(a.shutters) * 20
    const dadoH = a.wall_clad === 'dado' ? Math.min(3, E) : a.wall_clad === 'brick' ? E : 0
    const cladH = E - dadoH
    const gable = W * out.geom.rise
    const cladA = Math.max(2 * L * cladH + 2 * W * cladH + 2 * gable - (dadoH ? 0 : shutterA), 0)
    const brickVol = 2 * (L + W) * dadoH * 0.23 - (dadoH ? shutterA * 0.23 : 0)
    out.envelope = { roofA, sky, cladA, brickVol, shutterA, dadoH }
    const sheetKey = a.roof_sheet || 'gl050'
    add('Roof & walls', `Roof sheeting: ${({ gl047: 'Galvalume 0.47', gl050: 'Galvalume 0.50', puf50: 'PUF panel 50 mm' })[sheetKey]}`, roofA - sky, 'm²', R(sheetKey), 'incl. 6% side laps + ridge')
    add('Roof & walls', 'Polycarbonate skylights', sky, 'm²', R('polycarb'))
    add('Roof & walls', 'Wall cladding sheets', cladA, 'm²', R(sheetKey === 'puf50' ? 'puf50' : 'gl047'))
    if (brickVol > 0) {
      add('Roof & walls', 'Brick wall (incl. 5% breakage)', brickVol * 500 * 1.05, 'nos', R('brick'), `${fmt(brickVol)} m³ × 500/m³`)
      add('Roof & walls', 'Mortar + masonry labour', brickVol, 'm³', R('mortar') * 0.25 + R('masonry_labour'))
    }
    add('Roof & walls', 'Rolling shutters 4 × 5 m', shutterA, 'm²', R('shutter'))
  }

  if (isShed(a)) checks.push({ level: 'info', text: 'Excludes electrical, fire-fighting, plumbing, HVAC, roads, compound wall and machinery foundations. These typically add 25–45%.' })
  else checks.push({ level: 'info', text: 'Covers structure + masonry + plaster only. Flooring, doors and windows, electrical, plumbing and painting typically add 40–70%.' })

  // ── COST SHEET ──────────────────────────────────────────────
  const direct = boq.reduce((t, r) => t + r.amount, 0)
  const byCat = {}
  for (const r of boq) byCat[r.cat] = (byCat[r.cat] || 0) + r.amount
  const overhead = (direct * n(a.overhead_pct)) / 100
  const contingency = ((direct + overhead) * n(a.contingency_pct)) / 100
  const cost = direct + overhead + contingency
  const margin = (cost * n(a.margin_pct)) / 100
  const gst = ((cost + margin) * n(a.gst_pct)) / 100
  const total = cost + margin + gst
  out.cost = { byCat, direct, overhead, contingency, cost, margin, gst, total, perM2: builtUp > 0 ? total / builtUp : 0, perSqft: builtUp > 0 ? total / (builtUp * 10.7639) : 0 }

  // ── MARKET CHECK (accuracy benchmark, 2026-11-19) ──────────────
  // Published 2026 turnkey rates, per sq ft of built-up area. Sources: constructionestimatorindia.com
  // (PEB godown ₹1,200–1,900; PEB factory ₹1,200–1,850; factory incl. heavy ₹1,400–3,200) and
  // infralens.in city index (standard finished RCC house, Tamil Nadu cities ₹1,700–2,700).
  const m = marketRange(a)
  if (m && out.cost.perSqft > 0) {
    const [lo, hi] = m.addPct.map((p) => out.cost.perSqft * (1 + p / 100))
    const inRange = hi >= m.range[0] && lo <= m.range[1]
    checks.push({
      level: inRange ? 'ok' : 'warn',
      text: `Market check: published 2026 rates for a ${m.label} are ₹${m.range[0].toLocaleString('en-IN')}–${m.range[1].toLocaleString('en-IN')} per sq ft turnkey. ` +
        `This estimate is ₹${Math.round(out.cost.perSqft).toLocaleString('en-IN')} per sq ft for its scope; with the excluded items (+${m.addPct[0]}–${m.addPct[1]}%) about ₹${Math.round(lo).toLocaleString('en-IN')}–${Math.round(hi).toLocaleString('en-IN')}` +
        (inRange ? ', which is in line.' : ', which is outside that range: check the rates and sections against local quotes.'),
    })
  }
  return out
}

const STEEL_KG_PER_M3 = 7850
export function fmt(v, d = 0) {
  return (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })
}

/** Published 2026 turnkey ranges (₹ per sq ft) and the typical share added by the items this engine excludes. */
export function marketRange(a) {
  if (a.project_type === 'warehouse') return { label: 'basic PEB warehouse / godown', range: [1200, 1900], addPct: [25, 45] }
  if (a.project_type === 'industrial')
    return klass(a) === 'heavy'
      ? { label: 'heavy factory with cranes', range: [1400, 3200], addPct: [25, 45] }
      : { label: 'PEB factory', range: [1200, 1850], addPct: [25, 45] }
  if (a.project_type === 'house') return { label: 'standard finished RCC house in Tamil Nadu cities', range: [1700, 2700], addPct: [40, 70] }
  return null // no reliable published range for commercial buildings yet
}
