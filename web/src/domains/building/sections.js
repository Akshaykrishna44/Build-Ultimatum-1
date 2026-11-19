// ─────────────────────────────────────────────────────────────
// Steel section library.
// Hot-rolled values follow IS 808 nominal weights (verify against your supplier's
// section table before ordering). Cold-formed and rod weights are computed from geometry.
// Fields: kg (kg/m), h (depth mm), b (flange/leg mm), tf (flange thickness mm), surf (painted m² per m)
// ─────────────────────────────────────────────────────────────
export const STEEL_DENSITY = 7850 // kg/m³

const I = (name, kg, h, b, tf) => ({ name, family: 'I', kg, h, b, tf, surf: (2 * h + 4 * b) / 1000 })
const C = (name, kg, h, b, tf) => ({ name, family: 'C', kg, h, b, tf, surf: (2 * h + 4 * b) / 1000 })
const L = (name, kg, a, t) => ({ name, family: 'L', kg, h: a, b: a, tf: t, surf: (4 * a) / 1000 })

// Cold-formed Z / C purlin: developed width × thickness × density
function Z(h, b, t, lip = 20) {
  const dev = h + 2 * b + 2 * lip
  return { name: `Z ${h}×${b}×${t}`, family: 'Z', kg: +((dev * t * STEEL_DENSITY) / 1e6).toFixed(2), h, b, tf: t, surf: (2 * dev) / 1000 }
}
function ROD(d) {
  return { name: `Rod Ø${d}`, family: 'R', kg: +((Math.PI * d * d * STEEL_DENSITY) / 4 / 1e6).toFixed(2), h: d, b: d, tf: d, surf: (Math.PI * d) / 1000 }
}

export const SECTIONS = Object.fromEntries(
  [
    I('ISMB 200', 25.4, 200, 100, 10.8),
    I('ISMB 250', 37.3, 250, 125, 12.5),
    I('ISMB 300', 46.0, 300, 140, 12.4),
    I('ISMB 350', 52.4, 350, 140, 14.2),
    I('ISMB 400', 61.6, 400, 140, 16.0),
    I('ISMB 450', 72.4, 450, 150, 17.4),
    I('ISMB 500', 86.9, 500, 180, 17.2),
    I('ISMB 550', 103.7, 550, 190, 19.3),
    I('ISMB 600', 122.6, 600, 210, 20.8),
    C('ISMC 150', 16.8, 150, 75, 9.0),
    C('ISMC 200', 22.3, 200, 75, 11.4),
    C('ISMC 250', 30.6, 250, 80, 14.1),
    C('ISMC 300', 36.3, 300, 90, 13.6),
    L('ISA 65×65×6', 5.8, 65, 6),
    L('ISA 75×75×6', 6.8, 75, 6),
    L('ISA 90×90×8', 10.8, 90, 8),
    Z(175, 60, 2.0),
    Z(200, 60, 2.0),
    Z(200, 60, 2.5),
    Z(250, 75, 2.5),
    Z(250, 75, 3.0),
    ROD(16),
    ROD(20),
    ROD(25),
    // Crane girders: ISMB with an ISMC cap on the top flange
    { name: 'ISMB 450 + ISMC 250 (crane girder)', family: 'I', kg: 72.4 + 30.6, h: 450, b: 150, tf: 17.4, surf: (2 * 450 + 4 * 150 + 2 * 250) / 1000 },
    { name: 'ISMB 500 + ISMC 300 (crane girder)', family: 'I', kg: 86.9 + 36.3, h: 500, b: 180, tf: 17.2, surf: (2 * 500 + 4 * 180 + 2 * 300) / 1000 },
    { name: 'ISMB 600 + ISMC 300 (crane girder)', family: 'I', kg: 122.6 + 36.3, h: 600, b: 210, tf: 20.8, surf: (2 * 600 + 4 * 210 + 2 * 300) / 1000 },
  ].map((s) => [s.name, s]),
)

export const byFamily = (fams) => Object.values(SECTIONS).filter((s) => fams.includes(s.family)).map((s) => s.name)

export function plateKg(lengthMm, widthMm, thkMm, qty = 1) {
  return ((lengthMm * widthMm * thkMm) / 1e9) * STEEL_DENSITY * qty
}
