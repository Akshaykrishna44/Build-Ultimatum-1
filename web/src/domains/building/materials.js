// Spec 014 FR-014-04: raw materials for the building engine, built in code from the live answers (no AI).
// Sources are Indian producers, clusters and dealer types (spec 013). Prices come from the Rates table in the results.
import { isRCCFrame, isSteelRoof } from './questions.js'

const ROOF = { gl047: 'Galvalume 0.47 mm TCT', gl050: 'Galvalume 0.50 mm TCT', puf50: 'PUF insulated panel 50 mm' }
const PAINT = { primer_enamel: 'Zinc / red-oxide primer + enamel', epoxy: 'Epoxy 3-coat system', galv: 'Hot-dip galvanising' }
const WALL = {
  brick: { material: 'Walling: burnt clay bricks', grades: ['Class 3.5 / 5 (IS 1077)', '230 mm external, 115 mm internal'], india_sources: ['Local brick kilns in every district', 'Building-material dealers'] },
  aac: { material: 'Walling: AAC blocks', grades: ['600×200×200 mm (IS 2185-3)', 'Thin-bed jointing mortar'], india_sources: ['AAC plants (Gujarat, Tamil Nadu, Karnataka, Maharashtra, NCR)', 'Authorised dealers'] },
  block: { material: 'Walling: solid concrete blocks', grades: ['400×200×200 mm (IS 2185-1)'], india_sources: ['Local block-making units', 'Building-material dealers'] },
}

export function materialsFor(a) {
  const out = []
  const add = (material, used_for, grades, india_sources) => out.push({ material, used_for, grades, india_sources, typical_price: '', imported: false, origin: '' })
  if (isSteelRoof(a)) {
    add('Structural steel: plates and rolled sections', a.system === 'hybrid' ? 'Roof rafters, bracing' : 'Columns, rafters, bracing, crane girders', [`IS 2062 ${a.steel_grade || 'E250'}`, 'ISMB / ISMC / ISA sections, plates'], ['Primary mills (SAIL, JSW Steel, Tata Steel, JSPL) via authorised stockists', 'Re-rolling mills (Raipur, Mandi Gobindgarh)'])
    add('Cold-formed Z / C sections', 'Roof purlins and wall girts', ['Galvanised, 350–550 MPa', '1.6–3.15 mm thick'], ['Roll-forming units of PEB makers', 'Roll formers in Chennai, Pune, NCR and Ahmedabad belts'])
    add('Roof and wall sheets', 'Roof cover, side cladding, skylights', [ROOF[a.roof_sheet] || 'Galvalume 0.50 mm TCT', 'PPGI colour-coated', 'Polycarbonate skylights'], ['Coil makers (JSW, Tata BlueScope, AM/NS India) via dealers', 'Local sheet profilers in every district'])
    add('Fasteners and anchor bolts', 'Frame connections, foundations, sheeting', ['Grade 8.8 / HSFG bolts (IS 1367)', 'Anchor bolts', 'Self-drilling screws'], ['Fastener clusters (Ludhiana, Jalandhar, Rajkot)', 'Industrial hardware dealers'])
    add('Welding consumables', 'Fabrication of members and splices', ['E7018 electrodes', 'ER70S-6 wire', 'Flux-cored / SAW wire and flux'], ['Indian makers (Ador, ESAB India, D&H) via industrial dealers'])
    add('Primer and paint', 'Corrosion protection of steel', [PAINT[a.paint] || PAINT.primer_enamel], ['Industrial paint makers (Asian Paints PPG, Berger, Jotun India) via dealers'])
  }
  // every building has concrete foundations and floors
  add('Cement', 'Foundations, floors' + (isRCCFrame(a) || a.system === 'hybrid' ? ', RCC frame' : ''), ['OPC 53 (IS 269)', 'PPC (IS 1489)', `Concrete ${a.concrete_grade || 'M25'}`], ['Cement plants via dealers (Tamil Nadu, Andhra Pradesh, Rajasthan, MP, Chhattisgarh)', 'Ready-mix (RMC) plants near the site'])
  add('Aggregates and sand', 'Concrete, mortar, plaster', ['20 mm and 10 mm coarse aggregate', 'M-sand to IS 383 (river sand where permitted)'], ['Local quarries and stone crushers', 'M-sand units'])
  add('TMT reinforcement bars', 'Footings, slabs' + (isRCCFrame(a) || a.system === 'hybrid' ? ', columns and beams' : ''), [a.rebar_grade || 'Fe500D', 'IS 1786'], ['Primary mills (SAIL, JSW Neosteel, Tata Tiscon) via dealers', 'Secondary TMT mills (Raipur, Jalna, Durgapur)'])
  if (isRCCFrame(a)) {
    const w = WALL[a.wall_type] || WALL.brick
    out.push({ ...w, used_for: 'External and internal walls', typical_price: '', imported: false, origin: '' })
  } else if (['dado', 'brick'].includes(a.wall_clad)) {
    out.push({ ...WALL.brick, used_for: a.wall_clad === 'dado' ? 'Wall up to 3 m (dado)' : 'Full-height side walls', typical_price: '', imported: false, origin: '' })
  }
  return out
}
