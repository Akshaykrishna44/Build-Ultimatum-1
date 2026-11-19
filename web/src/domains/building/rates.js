// Indicative default rates (INR). PLACEHOLDERS: replace with current local quotes
// (e.g. Tamil Nadu SOR / supplier quotes). Every rate is editable in the Rates tab.
export const DEFAULT_RATES = {
  steel_rolled: { label: 'Structural steel, rolled sections', unit: '₹/kg', value: 62 },
  steel_cf: { label: 'Cold-formed purlins / girts', unit: '₹/kg', value: 78 },
  steel_rod: { label: 'Bracing rods', unit: '₹/kg', value: 65 },
  steel_plate: { label: 'Plates (base, connection)', unit: '₹/kg', value: 64 },
  e350_premium: { label: 'E350 grade premium', unit: '%', value: 5 },
  ctl_premium: { label: 'Cut-to-length premium', unit: '%', value: 2.5 },
  scrap_credit: { label: 'Scrap sale value', unit: '₹/kg', value: 32 },
  fab_shop: { label: 'Fabrication: shop', unit: '₹/kg', value: 16 },
  fab_site: { label: 'Fabrication: site', unit: '₹/kg', value: 20 },
  erection: { label: 'Erection', unit: '₹/kg', value: 7 },
  weld_smaw: { label: 'Electrodes E7018', unit: '₹/kg', value: 190 },
  weld_gmaw: { label: 'MIG wire ER70S-6', unit: '₹/kg', value: 140 },
  weld_fcaw: { label: 'Flux-cored wire', unit: '₹/kg', value: 230 },
  weld_saw: { label: 'SAW wire EM12K', unit: '₹/kg', value: 120 },
  saw_flux: { label: 'SAW flux', unit: '₹/kg', value: 90 },
  gas: { label: 'Shielding gas (CO₂ / mix)', unit: '₹/m³', value: 45 },
  power: { label: 'Electricity', unit: '₹/kWh', value: 9 },
  welder: { label: 'Welder labour', unit: '₹/hour', value: 125 },
  blast: { label: 'Blasting Sa 2½', unit: '₹/m²', value: 120 },
  primer: { label: 'Primer', unit: '₹/L', value: 360 },
  enamel: { label: 'Enamel paint', unit: '₹/L', value: 420 },
  epoxy: { label: 'Epoxy paint', unit: '₹/L', value: 900 },
  paint_labour: { label: 'Painting labour', unit: '₹/m²', value: 35 },
  galv: { label: 'Hot-dip galvanising', unit: '₹/kg', value: 28 },
  bolts: { label: 'Anchor bolts (set)', unit: '₹/no', value: 1200 },
  excavation: { label: 'Excavation', unit: '₹/m³', value: 450 },
  pcc: { label: 'PCC M10 (incl. labour)', unit: '₹/m³', value: 5200 },
  M20: { label: 'RCC M20 (RMC + placing)', unit: '₹/m³', value: 6400 },
  M25: { label: 'RCC M25 (RMC + placing)', unit: '₹/m³', value: 6800 },
  M30: { label: 'RCC M30 (RMC + placing)', unit: '₹/m³', value: 7300 },
  rebar: { label: 'Reinforcement (supply, cut, bend, fix)', unit: '₹/kg', value: 78 },
  formwork: { label: 'Formwork / shuttering', unit: '₹/m²', value: 480 },
  pile: { label: 'Bored cast-in-situ pile, 500 mm', unit: '₹/m', value: 4200 },
  fm2: { label: 'FM2 / VDF finish', unit: '₹/m²', value: 180 },
  epoxy_floor: { label: 'Epoxy floor coating', unit: '₹/m²', value: 850 },
  tiles: { label: 'Industrial tiles (laid)', unit: '₹/m²', value: 1100 },
  gl047: { label: 'Galvalume 0.47 mm (fixed)', unit: '₹/m²', value: 520 },
  gl050: { label: 'Galvalume 0.50 mm (fixed)', unit: '₹/m²', value: 580 },
  puf50: { label: 'PUF panel 50 mm (fixed)', unit: '₹/m²', value: 1650 },
  polycarb: { label: 'Polycarbonate skylight', unit: '₹/m²', value: 950 },
  brick: { label: 'Bricks', unit: '₹/no', value: 9 },
  aac: { label: 'AAC block 600×200×200', unit: '₹/no', value: 62 },
  block: { label: 'Concrete block 400×200×200', unit: '₹/no', value: 45 },
  mortar: { label: 'Masonry mortar 1:6 + labour', unit: '₹/m³', value: 6500 },
  masonry_labour: { label: 'Masonry labour', unit: '₹/m³', value: 1400 },
  plaster: { label: 'Plastering (12–20 mm)', unit: '₹/m²', value: 300 },
  shutter: { label: 'Rolling shutter, motorised', unit: '₹/m²', value: 4500 },
}

/** Bug sweep 2026-11-19 (FR-003-13): restore saved rates on top of today's rate list, so a rate added in a newer
 *  version is never missing (₹0) for a returning user, and junk saved values fall back to the default. */
export function mergeRates(saved) {
  const out = {}
  for (const [k, def] of Object.entries(DEFAULT_RATES)) {
    const v = saved && saved[k] && Number(saved[k].value)
    out[k] = Number.isFinite(v) && v >= 0 && saved[k].value !== '' ? { ...def, value: v } : def
  }
  return out
}
