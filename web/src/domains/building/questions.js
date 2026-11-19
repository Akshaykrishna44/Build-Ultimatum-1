// ─────────────────────────────────────────────────────────────
// Engineered question tree for buildings and industries.
// Each question can:
//   show(a) → only asked when relevant (classification drives the flow)
//   def(a)  → expert default that depends on earlier answers
// Defaults are typical Indian practice and serve as a starting point. Every value is editable.
// ─────────────────────────────────────────────────────────────
import { byFamily } from './sections.js'

export const isSteelRoof = (a) => ['peb', 'conventional', 'hybrid'].includes(a.system)
export const hasSteelColumns = (a) => ['peb', 'conventional'].includes(a.system)
export const isRCCFrame = (a) => a.system === 'rcc'
export const isIndustrial = (a) => a.project_type === 'industrial'
export const isShed = (a) => ['industrial', 'warehouse'].includes(a.project_type)
export const klass = (a) =>
  a.project_type === 'industrial' ? a.industry_class || 'medium' : a.project_type === 'warehouse' ? 'light' : a.project_type === 'house' ? 'house' : 'light'

const pick = (a, light, medium, heavy) => ({ light, medium, heavy, house: light })[klass(a)] ?? light
const opt = (value, label, note = '') => ({ value, label, note })
const optsFrom = (names) => names.map((n) => opt(n, n))

export const CLASS_INFO = {
  light: { label: 'Light industry', loads: 'Floor 5–7.5 kN/m² · crane none or ≤ 5 t', steel: [20, 32], examples: 'Assembly, electronics, garments, food, packaging, warehousing' },
  medium: { label: 'Medium industry', loads: 'Floor 7.5–15 kN/m² · crane 5–20 t', steel: [30, 48], examples: 'Machine shops, auto components, plastics, fabrication' },
  heavy: { label: 'Heavy industry', loads: 'Floor > 15 kN/m² · crane 20–100 t', steel: [50, 110], examples: 'Steel plants, foundries, heavy engineering, cement, shipbuilding' },
  house: { label: 'Residential', loads: 'Floor 2–3 kN/m²', steel: [0, 0], examples: 'Independent house, villa, small apartment' },
}

export const STAGES = [
  {
    id: 'classify',
    title: 'Classification',
    intro: 'What are we building? Every later question and default depends on this.',
    questions: [
      { id: 'project_type', q: 'What type of project is it?', why: 'Decides structural system, loads, finishes and the whole question flow', type: 'single', def: 'industrial',
        options: [opt('industrial', 'Industrial building / factory', 'Production shed with machines, possibly cranes'), opt('warehouse', 'Warehouse / storage', 'Large clear spans, racks, light loads'), opt('commercial', 'Commercial building', 'Showroom, office, multi-floor'), opt('house', 'House / residential', 'RCC framed, brick walls')] },
      { id: 'industry_class', q: 'Which industry class?', why: 'Sets floor loads, crane capacity, steel intensity (kg/m²) and foundation size', type: 'single', show: isIndustrial, def: 'medium',
        options: ['light', 'medium', 'heavy'].map((k) => opt(k, CLASS_INFO[k].label, `${CLASS_INFO[k].loads}. e.g. ${CLASS_INFO[k].examples}`)) },
      { id: 'sector', q: 'Which manufacturing sector?', why: 'Drives special needs: clean rooms, fire rating, chemical-resistant floors, ventilation', type: 'single', show: isIndustrial, def: 'engineering',
        options: [opt('engineering', 'Engineering / fabrication'), opt('auto', 'Automotive components'), opt('textile', 'Textiles / garments'), opt('food', 'Food processing', 'Hygienic floors & washable walls'), opt('electronics', 'Electronics assembly', 'Dust control, ESD floor'), opt('pharma', 'Pharma / chemicals', 'Chemical-resistant floor, fire separation'), opt('plastics', 'Plastics / moulding'), opt('metals', 'Steel / foundry / forging', 'Heavy cranes, heat, very high loads'), opt('other', 'Other')] },
    ],
  },
  {
    id: 'size',
    title: 'Size & site',
    intro: 'Geometry and ground conditions.',
    questions: [
      { id: 'length', q: 'Building length (m)?', why: 'Number of bays and frames', type: 'number', unit: 'm', def: (a) => ({ house: 15, industrial: 60, warehouse: 80, commercial: 30 })[a.project_type] },
      { id: 'width', q: 'Building width (m)?', why: 'Span of the roof frames', type: 'number', unit: 'm', def: (a) => ({ house: 10, industrial: 30, warehouse: 40, commercial: 20 })[a.project_type] },
      { id: 'floors', q: 'Number of floors (including ground)?', why: 'Column, beam and slab quantities', type: 'number', unit: 'floors', show: (a) => !isShed(a), def: (a) => (a.project_type === 'house' ? 2 : 3) },
      { id: 'floor_height', q: 'Floor-to-floor height (m)?', why: 'Column and wall heights', type: 'number', unit: 'm', show: (a) => !isShed(a), def: 3.2 },
      { id: 'eave_height', q: 'Eave (clear) height (m)?', why: 'Column length, cladding area, crane clearance', type: 'number', unit: 'm', show: isShed, def: (a) => (a.project_type === 'warehouse' ? 10 : pick(a, 8, 10, 14)) },
      { id: 'roof_slope', q: 'Roof slope?', why: 'Rafter length, roof sheet area, rain run-off', type: 'single', show: isSteelRoof, def: '10',
        options: [opt('10', '1 : 10 (5.7°)', 'Most common for PEB'), opt('12', '1 : 12 (4.8°)', 'Flatter, less sheet'), opt('6', '1 : 6 (9.5°)', 'Steeper, heavy-rain areas')] },
      { id: 'soil', q: 'Soil condition at site?', why: 'Footing size and type (get a soil test before final design)', type: 'single', def: 'medium',
        options: [opt('hard', 'Hard / rocky', 'SBC > 250 kN/m²; smaller footings'), opt('medium', 'Medium / stiff soil', 'SBC 150–250 kN/m²'), opt('soft', 'Soft / filled / clayey', 'SBC < 100 kN/m²; consider pile or raft')] },
      { id: 'seismic', q: 'Seismic zone (IS 1893)?', why: 'Bracing frequency and detailing', type: 'single', def: 'III',
        options: [opt('II', 'Zone II', 'Low'), opt('III', 'Zone III', 'Moderate (e.g. Chennai)'), opt('IV', 'Zone IV', 'Severe'), opt('V', 'Zone V', 'Very severe')] },
    ],
  },
  {
    id: 'system',
    title: 'Structural system',
    intro: 'How the building stands up.',
    questions: [
      { id: 'system', q: 'Which structural system?', why: 'The single biggest decision for cost, speed and future expansion', type: 'single', def: (a) => (isShed(a) ? 'peb' : 'rcc'),
        options: [opt('peb', 'Pre-engineered building (PEB)', 'Tapered built-up steel, fastest, lightest, best for spans of 20–90 m'), opt('conventional', 'Conventional steel (hot-rolled)', 'ISMB/ISMC sections, easy local fabrication'), opt('hybrid', 'Hybrid: RCC columns + steel roof', 'Good when a crane or heavy wall loads are on columns'), opt('rcc', 'RCC framed', 'Houses and multi-floor buildings')] },
      { id: 'steel_grade', q: 'Structural steel grade (IS 2062)?', why: 'Higher grade means lighter sections at a slightly higher rate', type: 'single', show: isSteelRoof, def: (a) => (a.system === 'peb' ? 'E350' : 'E250'),
        options: [opt('E250', 'E250 (Fe 410)', 'Standard rolled sections'), opt('E350', 'E350 (Fe 490)', '≈10% lighter main frames, ≈5% higher rate')] },
      { id: 'spans', q: 'How many spans across the width?', why: 'Single spans over ~30 m get heavy; interior columns reduce steel', type: 'number', unit: 'spans', show: isSteelRoof, def: (a) => Math.max(1, Math.ceil((a.width || 30) / 30)) },
      { id: 'bay', q: 'Bay spacing (frame-to-frame, m)?', why: 'Economic range is 6–9 m; it drives purlin size and frame count', type: 'number', unit: 'm', show: isSteelRoof, def: (a) => pick(a, 7.5, 7.5, 6) },
    ],
  },
  {
    id: 'members',
    title: 'Steel members',
    intro: 'Columns, beams/rafters, purlins, girts, bracing, crane.',
    show: isSteelRoof,
    questions: [
      { id: 'col_section', q: 'Main column section?', why: 'For PEB, enter the equivalent rolled weight of the tapered column', type: 'single', show: hasSteelColumns, options: optsFrom(byFamily(['I'])).filter((o) => !o.value.includes('crane')), def: (a) => pick(a, 'ISMB 350', 'ISMB 450', 'ISMB 600') },
      { id: 'raf_section', q: 'Rafter / roof beam section?', why: 'Main roof beam; the biggest steel item', type: 'single', options: optsFrom(byFamily(['I'])).filter((o) => !o.value.includes('crane')), def: (a) => pick(a, 'ISMB 400', 'ISMB 500', 'ISMB 600') },
      { id: 'purlin_section', q: 'Roof purlin section (cold-formed Z)?', why: 'Carries roof sheets between frames', type: 'single', options: optsFrom(byFamily(['Z'])), def: (a) => pick(a, 'Z 200×60×2', 'Z 200×60×2.5', 'Z 250×75×2.5') },
      { id: 'purlin_spacing', q: 'Purlin spacing (m)?', why: '1.2–1.8 m typical; depends on sheet thickness and wind', type: 'number', unit: 'm', def: 1.5 },
      { id: 'girt_section', q: 'Wall girt section?', why: 'Carries wall cladding', type: 'single', show: hasSteelColumns, options: optsFrom(byFamily(['Z'])), def: 'Z 175×60×2' },
      { id: 'girt_spacing', q: 'Girt spacing (m)?', why: 'Rows of girts up the wall', type: 'number', unit: 'm', show: hasSteelColumns, def: 1.8 },
      { id: 'bracing', q: 'Bracing type?', why: 'Resists wind and earthquake loads along the building', type: 'single', options: [opt('Rod Ø20', 'Rod Ø20', 'Light, cheap, tension-only'), opt('Rod Ø25', 'Rod Ø25', 'Higher wind or seismic loads'), opt('ISA 75×75×6', 'Angle ISA 75×75×6', 'Tension and compression, for cranes')], def: (a) => (Number(a.crane) > 0 ? 'ISA 75×75×6' : 'Rod Ø20') },
      { id: 'crane', q: 'EOT crane capacity?', why: 'Adds crane girders and rails, and makes columns, brackets and foundations heavier', type: 'single', show: isIndustrial,
        options: [opt('0', 'No crane'), opt('5', '5 t'), opt('10', '10 t'), opt('20', '20 t'), opt('30', '30 t'), opt('50', '50 t')], def: (a) => pick(a, '0', '10', '30') },
      { id: 'crane_section', q: 'Crane girder section?', why: 'Runs the full length on both sides of the crane bay', type: 'single', show: (a) => Number(a.crane) > 0, options: optsFrom(byFamily(['I']).filter((n) => n.includes('crane'))),
        def: (a) => (Number(a.crane) <= 10 ? 'ISMB 450 + ISMC 250 (crane girder)' : Number(a.crane) <= 20 ? 'ISMB 500 + ISMC 300 (crane girder)' : 'ISMB 600 + ISMC 300 (crane girder)') },
      { id: 'mezz_area', q: 'Steel mezzanine floor area (m²)?', why: 'Offices or storage platforms inside the shed (≈ 40 kg/m² steel)', type: 'number', unit: 'm²', show: isShed, def: 0 },
      { id: 'conn_pct', q: 'Connection allowance (plates, cleats, bolts) %?', why: 'Rule of thumb: 8–10% for PEB, 10–15% for conventional steel', type: 'number', unit: '%', def: (a) => (a.system === 'peb' ? 8 : 12) },
    ],
  },
  {
    id: 'cutting',
    title: 'Cutting & fabrication',
    intro: 'How steel is bought and cut. This is where wastage is decided.',
    show: isSteelRoof,
    questions: [
      { id: 'stock_policy', q: 'How will you buy steel lengths?', why: 'The stock length decides the offcut (cutting wastage). Cold-formed purlins and girts are always roll-formed to exact length.', type: 'single', def: 'best',
        options: [opt('std', 'Standard 12 m mill lengths', 'Cheapest per kg, most offcuts'), opt('best', 'Best of 6 / 9 / 10.5 / 12 m', 'The engine picks the length with the least loss for each section'), opt('ctl', 'Cut-to-length from mill', 'Almost zero offcut, +2–3% price premium')] },
      { id: 'cut_method', q: 'Cutting method?', why: 'Sets the kerf (material lost in every cut) and edge quality', type: 'single', def: 'bandsaw',
        options: [opt('bandsaw', 'Band saw', 'Kerf ≈ 2 mm, clean square cut'), opt('coldsaw', 'Cold circular saw', 'Kerf ≈ 3 mm'), opt('gas', 'Oxy-fuel gas cutting', 'Kerf ≈ 4 mm, needs grinding'), opt('plasma', 'CNC plasma', 'Kerf ≈ 3 mm, good for plates and holes')] },
      { id: 'min_reuse', q: 'Minimum reusable offcut length (m)?', why: 'Offcuts shorter than this become scrap', type: 'number', unit: 'm', def: 1.0 },
      { id: 'reuse_share', q: 'What share of reusable offcuts will actually be reused (cleats, gussets, stubs)?', why: 'Offcuts that are not reused end up sold as scrap at about half the price', type: 'number', unit: '%', show: (a) => a.stock_policy !== 'ctl', def: 40 },
      { id: 'fab_location', q: 'Where will fabrication happen?', why: 'Shop welding is faster and better quality; site welding needs SMAW and more inspection', type: 'single', def: 'shop', options: [opt('shop', 'Fabrication shop'), opt('site', 'At site')] },
    ],
  },
  {
    id: 'welding',
    title: 'Welding',
    intro: 'Process, weld sizes and inspection.',
    show: isSteelRoof,
    questions: [
      { id: 'weld_process', q: 'Main welding process?', why: 'Changes consumable loss (deposition efficiency), speed and cost', type: 'single', def: (a) => (a.fab_location === 'site' ? 'smaw' : a.system === 'peb' ? 'saw' : 'gmaw'),
        options: [opt('smaw', 'SMAW / stick (MMA)', 'Efficiency ≈ 60%, 1–2 kg/h, site friendly'), opt('gmaw', 'GMAW / MIG-MAG', 'Efficiency ≈ 93%, 3–5 kg/h, shop'), opt('fcaw', 'FCAW / flux-cored', 'Efficiency ≈ 85%, 4–6 kg/h, positional'), opt('saw', 'SAW / submerged arc', 'Efficiency ≈ 98%, 6–12 kg/h, automatic long seams')] },
      { id: 'built_up', q: 'Are main members built-up from plates (PEB style)?', why: 'Built-up members need continuous flange-to-web welds along their full length', type: 'single', def: (a) => (a.system === 'peb' ? 'yes' : 'no'), options: [opt('yes', 'Yes, built-up plate girders'), opt('no', 'No, rolled sections')] },
      { id: 'weld_sides', q: 'Flange-to-web welds on one side or both?', why: 'Both sides doubles the weld length', type: 'single', show: (a) => a.built_up === 'yes', def: '1', options: [opt('1', 'One side (common in PEB)'), opt('2', 'Both sides (heavy or dynamic loads)')] },
      { id: 'fillet_size', q: 'Typical fillet weld size (mm)?', why: 'Weld metal grows with size²', type: 'single', def: (a) => pick(a, '6', '8', '10'), options: ['5', '6', '8', '10', '12'].map((s) => opt(s, s + ' mm')) },
      { id: 'butt_thk', q: 'Plate thickness at full-penetration splices (mm)?', why: 'Used for single-V butt welds at member splices', type: 'number', unit: 'mm', def: (a) => pick(a, 12, 16, 20) },
      { id: 'ndt', q: 'Weld inspection (NDT) level?', why: 'Adds testing cost; required for crane girders and heavy work', type: 'single', def: (a) => (Number(a.crane) > 0 ? 'ut10' : 'dpt'),
        options: [opt('visual', 'Visual only'), opt('dpt', 'Visual + DPT 10%', '+2% of welding cost'), opt('ut10', 'UT 10% of butt welds', '+5%'), opt('ut100', 'UT 100% of butt welds', '+12%, crane girders and heavy industry')] },
    ],
  },
  {
    id: 'rcc',
    title: 'RCC frame & walls',
    intro: 'Columns, beams, slabs and masonry.',
    show: (a) => isRCCFrame(a) || a.system === 'hybrid',
    questions: [
      { id: 'grid', q: 'Column grid spacing (m)?', why: 'Number of columns and beams', type: 'number', unit: 'm', show: isRCCFrame, def: 4 },
      { id: 'rcc_col', q: 'RCC column size (mm)?', why: 'Concrete and rebar in columns', type: 'single', def: (a) => (a.system === 'hybrid' ? '450×450' : a.project_type === 'house' ? '230×450' : '300×600'),
        options: ['230×450', '300×450', '300×600', '450×450', '600×600'].map((s) => opt(s, s)) },
      { id: 'rcc_beam', q: 'RCC beam size (mm)?', why: 'Concrete and rebar in beams', type: 'single', show: isRCCFrame, def: (a) => (a.project_type === 'house' ? '230×450' : '300×600'), options: ['230×400', '230×450', '300×600'].map((s) => opt(s, s)) },
      { id: 'slab_thk', q: 'Floor / roof slab thickness (mm)?', why: 'Slab concrete is the largest RCC quantity', type: 'single', show: isRCCFrame, def: (a) => (a.project_type === 'house' ? '125' : '150'), options: ['125', '150', '175', '200'].map((s) => opt(s, s + ' mm')) },
      { id: 'wall_type', q: 'Wall material?', why: 'Masonry quantity, weight on beams, thermal comfort', type: 'single', show: isRCCFrame, def: 'brick',
        options: [opt('brick', 'Burnt clay brick (230 ext / 115 int)', '≈ 500 bricks per m³'), opt('aac', 'AAC blocks (600×200×200)', 'Light and fast, ≈ 42 blocks per m³'), opt('block', 'Solid concrete blocks (400×200×200)', '≈ 63 blocks per m³')] },
      { id: 'openings', q: 'Openings (doors and windows) as % of wall area?', why: 'Deducted from masonry and plaster', type: 'number', unit: '%', show: isRCCFrame, def: 20 },
    ],
  },
  {
    id: 'foundation',
    title: 'Foundation & floor',
    intro: 'Footings, plinth and the floor slab.',
    questions: [
      { id: 'footing_type', q: 'Foundation type?', why: 'Soft soil or heavy cranes may need piles or a raft', type: 'single', def: (a) => (a.soil === 'soft' ? 'pile' : 'isolated'),
        options: [opt('isolated', 'Isolated footings', 'Most common on medium or hard soil'), opt('raft', 'Raft', 'Soft soil, closely spaced heavy columns'), opt('pile', 'Pile foundation', 'Soft or filled soil; needs a geotechnical report')] },
      { id: 'footing_size', q: 'Typical footing size (m, square)?', why: 'Changes with column load and soil bearing capacity', type: 'number', unit: 'm', show: (a) => a.footing_type !== 'raft', def: (a) => pick(a, 1.5, 2.0, 2.5) },
      { id: 'footing_depth', q: 'Footing thickness (m)?', why: 'Concrete per footing', type: 'number', unit: 'm', show: (a) => a.footing_type !== 'raft', def: (a) => pick(a, 0.5, 0.75, 1.0) },
      { id: 'concrete_grade', q: 'Concrete grade?', why: 'IS 456 minimum is M20 for RCC; industrial floors use M25 or more', type: 'single', def: (a) => (a.project_type === 'house' ? 'M20' : 'M25'), options: ['M20', 'M25', 'M30'].map((g) => opt(g, g)) },
      { id: 'rebar_grade', q: 'Reinforcement steel grade?', why: 'Fe500D is preferred in seismic zones for ductility', type: 'single', def: 'Fe500D', options: [opt('Fe500', 'Fe500'), opt('Fe500D', 'Fe500D', 'More ductile'), opt('Fe550D', 'Fe550D', 'Slightly less steel, higher rate')] },
      { id: 'floor_type', q: 'Ground floor finish?', why: 'Industrial floors must take forklift and rack loads', type: 'single', show: isShed, def: (a) => (a.sector === 'food' || a.sector === 'pharma' ? 'epoxy' : 'fm2'),
        options: [opt('plain', 'Plain RCC grade slab'), opt('fm2', 'FM2 / VDF trowelled floor', 'Standard for factories'), opt('epoxy', 'Epoxy coated', 'Hygienic, chemical resistant'), opt('tiles', 'Industrial tiles')] },
      { id: 'floor_thk', q: 'Grade slab thickness (mm)?', why: 'Depends on rack legs, forklift and machine loads', type: 'single', show: isShed, def: (a) => pick(a, '150', '200', '250'), options: ['150', '200', '250', '300'].map((s) => opt(s, s + ' mm')) },
    ],
  },
  {
    id: 'envelope',
    title: 'Roof & walls',
    intro: 'Sheeting, skylights, cladding and doors.',
    show: isShed,
    questions: [
      { id: 'roof_sheet', q: 'Roof sheet?', why: 'Thickness and insulation drive cost and comfort', type: 'single', def: 'gl050',
        options: [opt('gl047', 'Galvalume 0.47 mm TCT', 'Economy'), opt('gl050', 'Galvalume 0.50 mm TCT', 'Standard industrial'), opt('puf50', 'PUF insulated panel 50 mm', 'Cool interiors, for food, pharma, electronics')] },
      { id: 'skylight_pct', q: 'Skylight / daylight panels as % of roof?', why: 'Reduces lighting power; uses polycarbonate sheet', type: 'number', unit: '%', def: 5 },
      { id: 'wall_clad', q: 'Side wall construction?', why: 'Security, fire and cost', type: 'single', def: 'dado',
        options: [opt('sheet', 'Full-height metal cladding'), opt('dado', 'Brick wall up to 3 m + cladding above', 'Most common'), opt('brick', 'Full-height brick wall')] },
      { id: 'shutters', q: 'Number of rolling shutters (4 m × 5 m)?', why: 'Truck and forklift access', type: 'number', unit: 'nos', def: (a) => Math.max(2, Math.round((a.length || 60) / 30)) },
    ],
  },
  {
    id: 'finish',
    title: 'Surface protection',
    intro: 'Corrosion protection of steel.',
    show: isSteelRoof,
    questions: [
      { id: 'surface_prep', q: 'Surface preparation?', why: 'Paint life depends mostly on preparation', type: 'single', def: (a) => (a.system === 'peb' ? 'sa25' : 'st2'),
        options: [opt('st2', 'Hand / power tool cleaning (St 2)', 'Basic'), opt('sa25', 'Shot / grit blasting (Sa 2½)', 'Industrial standard')] },
      { id: 'paint', q: 'Protection system?', why: 'Coastal or chemical environments need epoxy or galvanising', type: 'single', def: 'primer_enamel',
        options: [opt('primer_enamel', 'Red-oxide / zinc primer + 2 coats enamel'), opt('epoxy', 'Epoxy system (3 coats)', 'Coastal or chemical areas'), opt('galv', 'Hot-dip galvanising', 'Longest life; priced per kg')] },
    ],
  },
  {
    id: 'commercial',
    title: 'Commercial terms',
    intro: 'Percentages applied on the direct cost.',
    questions: [
      { id: 'overhead_pct', q: 'Overhead % (site establishment, supervision, insurance)?', why: 'Applied on direct cost', type: 'number', unit: '%', def: 8 },
      { id: 'contingency_pct', q: 'Contingency %?', why: 'Buffer for price rises and design changes', type: 'number', unit: '%', def: 5 },
      { id: 'margin_pct', q: 'Contractor margin %?', why: 'Profit on cost', type: 'number', unit: '%', def: 10 },
      { id: 'gst_pct', q: 'GST %?', why: 'Works contract GST (verify for your contract type)', type: 'number', unit: '%', def: 18 },
    ],
  },
]

export function visibleStages(a) {
  return STAGES.filter((s) => !s.show || s.show(a))
    .map((s) => ({ ...s, questions: s.questions.filter((q) => !q.show || q.show(a)) }))
    .filter((s) => s.questions.length)
}

export function defaultOf(q, a) {
  return typeof q.def === 'function' ? q.def(a) : q.def
}

/** Fill every visible, unanswered question with its expert default (in order, so later defaults see earlier answers). */
export function withDefaults(answers, touched = {}) {
  const a = { ...answers }
  for (let pass = 0; pass < 2; pass++)
    for (const s of STAGES) {
      if (s.show && !s.show(a)) continue
      for (const q of s.questions) {
        if (q.show && !q.show(a)) continue
        if (!touched[q.id]) a[q.id] = defaultOf(q, a)
      }
    }
  return a
}
