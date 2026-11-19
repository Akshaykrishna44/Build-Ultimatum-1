// ─────────────────────────────────────────────────────────────
// 1-D cutting-stock optimiser (First-Fit Decreasing) for steel sections and rebar.
//   • Pieces longer than the stock bar are split into equal segments joined by splices.
//   • Each cut consumes the saw kerf.
//   • Offcuts ≥ minReuse are "reusable" (go back to store); smaller offcuts are scrap.
// Wastage % = scrap ÷ stock bought.  (Reusable offcuts are reported separately.)
// ─────────────────────────────────────────────────────────────

/**
 * @param {Array<{mark:string,length:number,qty:number}>} pieces  lengths in metres
 * @param {{stock:number, kerf:number, minReuse:number}} opt  stock & minReuse in m, kerf in mm
 */
export const MAX_SIM_PIECES = 4000

export function optimiseCutting(pieces, { stock = 12, kerf = 3, minReuse = 1.0 } = {}) {
  const k = kerf / 1000
  // Very large jobs: First-Fit is O(pieces × bars). Above MAX_SIM_PIECES, optimise a proportional sample of the
  // same piece mix and scale the totals; the wastage % is intensive, so it is unchanged (bug sweep 2026-11-19).
  const segsOf = (p) => (p.length > stock ? Math.ceil(p.length / (stock - k)) : 1)
  const valid = pieces.filter((p) => p.length > 0 && p.qty > 0)
  const total = valid.reduce((a, p) => a + p.qty * segsOf(p), 0)
  if (total > MAX_SIM_PIECES) {
    const f = total / MAX_SIM_PIECES
    const sample = valid.map((p) => ({ ...p, qty: Math.max(1, Math.round(p.qty / f)) }))
    const r = optimiseCutting(sample, { stock, kerf, minReuse })
    const trueNet = valid.reduce((a, p) => a + p.length * p.qty, 0)
    const x = r.netM > 0 ? trueNet / r.netM : 1
    return {
      ...r,
      bars: Math.ceil(r.bars * x),
      boughtM: r.boughtM * x,
      netM: trueNet,
      scrapM: r.scrapM * x,
      reusableM: r.reusableM * x,
      splices: valid.reduce((a, p) => a + (segsOf(p) - 1) * p.qty, 0),
      pieces: total,
      offcuts: r.offcuts,
      sampled: true,
    }
  }
  const list = []
  let splices = 0
  for (const p of pieces) {
    if (!(p.length > 0) || !(p.qty > 0)) continue
    let segs = 1
    if (p.length > stock) {
      segs = Math.ceil(p.length / (stock - k))
      splices += (segs - 1) * p.qty
    }
    const segLen = p.length / segs
    for (let i = 0; i < p.qty * segs; i++) list.push({ mark: p.mark + (segs > 1 ? ` (1/${segs} seg)` : ''), len: segLen })
  }
  list.sort((a, b) => b.len - a.len)

  const bars = [] // {cuts:[{mark,len}], used}
  for (const piece of list) {
    let placed = false
    for (const bar of bars) {
      const need = piece.len + (bar.cuts.length ? k : 0)
      if (bar.used + need <= stock + 1e-9) {
        bar.cuts.push(piece)
        bar.used += need
        placed = true
        break
      }
    }
    if (!placed) bars.push({ cuts: [piece], used: piece.len })
  }

  let scrap = 0
  let reusable = 0
  let kerfLoss = 0
  const offcuts = []
  for (const b of bars) {
    b.offcut = Math.max(stock - b.used, 0)
    kerfLoss += (b.cuts.length - 1) * k + (b.offcut > 0 ? k : 0)
    if (b.offcut >= minReuse) {
      reusable += b.offcut
      offcuts.push(b.offcut)
    } else scrap += b.offcut
  }
  const bought = bars.length * stock
  const net = list.reduce((a, p) => a + p.len, 0)
  return {
    stock,
    bars: bars.length,
    boughtM: bought,
    netM: net,
    scrapM: scrap + kerfLoss,
    reusableM: reusable,
    wastagePct: bought ? ((scrap + kerfLoss) / bought) * 100 : 0,
    grossLossPct: bought ? ((bought - net) / bought) * 100 : 0,
    splices,
    pieces: list.length,
    plan: bars, // full cutting plan for drawing the bar diagram
    offcuts: offcuts.sort((a, b) => b - a),
  }
}

/**
 * Stock-length policy:
 *   'std'  → standard mill length only (e.g. 12 m)
 *   'best' → try every available stock length, keep the one with the least total offcut
 *   'ctl'  → cut-to-length from the mill: one bar per piece, loss = kerf only (mill charges a premium)
 */
export function cutWithPolicy(pieces, { policy = 'std', stocks = [6, 9, 10.5, 12], std = 12, kerf = 3, minReuse = 1, reuseShare = 0.4 } = {}) {
  let r
  if (policy === 'ctl') {
    const max = Math.max(...pieces.map((p) => p.length), 0)
    r = optimiseCutting(pieces, { stock: Math.max(std, max + kerf / 1000), kerf, minReuse })
    // Mill cuts to exact length: bought = net + kerf allowance
    const net = r.netM
    r = { ...r, stock: 'cut-to-length', bars: r.pieces, boughtM: net * 1.002, scrapM: net * 0.002, reusableM: 0, wastagePct: 0.2, grossLossPct: 0.2, offcuts: [], plan: [] }
  } else if (policy === 'best') {
    const tries = stocks.map((s) => optimiseCutting(pieces, { stock: s, kerf, minReuse }))
    r = tries.reduce((a, b) => (b.boughtM < a.boughtM - 1e-9 ? b : a))
    r.alternatives = tries.map((t) => ({ stock: t.stock, bars: t.bars, boughtM: t.boughtM, grossLossPct: t.grossLossPct }))
  } else {
    r = optimiseCutting(pieces, { stock: std, kerf, minReuse })
  }
  // Wastage actually lost to this project: scrap + the share of "reusable" offcuts that never gets reused
  r.reusedM = r.reusableM * reuseShare
  r.chargedLossM = r.boughtM - r.netM - r.reusedM
  r.chargedLossPct = r.boughtM ? (r.chargedLossM / r.boughtM) * 100 : 0
  return r
}
