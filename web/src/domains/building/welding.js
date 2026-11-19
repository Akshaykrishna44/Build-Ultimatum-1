// ─────────────────────────────────────────────────────────────
// Welding calculator.
//   Fillet weld metal (kg/m) = (s² / 2) mm² × 1e-6 × 7850 × (1 + reinforcement)
//   Single-V butt (60°)      = (t² · tan30° + gap · t) mm² × 1e-6 × 7850 × (1 + reinforcement)
//   Consumable (kg)          = weld metal ÷ deposition efficiency
//   Arc time (h)             = weld metal ÷ deposition rate
//   Welder hours             = arc time ÷ operating factor
// Process figures are typical shop values; all are editable in the UI.
// ─────────────────────────────────────────────────────────────
import { STEEL_DENSITY } from './sections.js'

export const PROCESSES = {
  smaw: { label: 'SMAW (stick / MMA)', efficiency: 0.6, depositionKgHr: 1.5, operatingFactor: 0.3, gasLpm: 0, volts: 25, amps: 150, consumable: 'E7018 electrodes', note: 'Site-friendly and cheap equipment, but slow. About 40% of the electrode is lost as stubs, spatter and flux.' },
  gmaw: { label: 'GMAW (MIG / MAG)', efficiency: 0.93, depositionKgHr: 4, operatingFactor: 0.45, gasLpm: 15, volts: 28, amps: 250, consumable: 'ER70S-6 solid wire + CO₂/Ar', note: 'Fast shop process with high efficiency. Needs shielding gas, so not suited to windy sites.' },
  fcaw: { label: 'FCAW (flux-cored)', efficiency: 0.85, depositionKgHr: 5, operatingFactor: 0.45, gasLpm: 15, volts: 27, amps: 260, consumable: 'E71T-1 flux-cored wire', note: 'High deposition and good for positional work. Slag must be removed after welding.' },
  saw: { label: 'SAW (submerged arc)', efficiency: 0.98, depositionKgHr: 9, operatingFactor: 0.6, gasLpm: 0, volts: 32, amps: 600, consumable: 'EM12K wire + flux (≈1.2 kg flux per kg wire)', note: 'Automatic welding for long straight seams on built-up PEB sections. Very high output.' },
}

export function filletKgPerM(size, reinforcement = 0.1) {
  return ((size * size) / 2) * 1e-6 * STEEL_DENSITY * (1 + reinforcement)
}

export function buttKgPerM(thk, gap = 2, reinforcement = 0.1) {
  return (thk * thk * Math.tan(Math.PI / 6) + gap * thk) * 1e-6 * STEEL_DENSITY * (1 + reinforcement)
}

/**
 * @param {{filletM:number, buttM:number}} lengths   weld lengths in metres
 * @param {{process:string, filletSize:number, buttThk:number, overrides?:object}} opt
 */
export function weldingCalc(lengths, { process = 'gmaw', filletSize = 6, buttThk = 12, overrides = {} } = {}) {
  const p = { ...PROCESSES[process], ...overrides }
  const filletKg = lengths.filletM * filletKgPerM(filletSize)
  const buttKg = lengths.buttM * buttKgPerM(buttThk)
  const metal = filletKg + buttKg
  const consumable = metal / p.efficiency
  const arcHr = metal / p.depositionKgHr
  const welderHr = arcHr / p.operatingFactor
  const gasM3 = (p.gasLpm * arcHr * 60) / 1000
  const fluxKg = process === 'saw' ? consumable * 1.2 : 0
  const kWh = (arcHr * p.volts * p.amps) / 1000 / 0.8 // 80% machine efficiency
  return { process, p, filletKgPerM: filletKgPerM(filletSize), buttKgPerM: buttKgPerM(buttThk), filletKg, buttKg, metal, consumable, lossKg: consumable - metal, lossPct: (1 - p.efficiency) * 100, arcHr, welderHr, gasM3, fluxKg, kWh, lengths }
}
