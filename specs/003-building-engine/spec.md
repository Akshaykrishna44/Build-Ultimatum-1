# Spec 003 — Building & industry engine (engineered)

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-17 (written retroactively) |
| **Shipped in** | v0.3.0 (pre-fill v0.4.0) |
| **Modes** | both (runs in the browser; Python port is spec 004) |
| **Depends on** | 001 |

## 0. Mission fit
**Every aspect** of buildings with engineered logic: steel, cutting, welding, concrete, envelope, BOQ. **Smart solution:** stock-policy and welding-process comparisons, engineering checks, AI expert review.

## 1. Problem
For buildings and industries (factory, warehouse, commercial building, house), clients need engineering-grade questions and calculations, not AI guesses. That means classification (light/medium/heavy), steel members, cutting wastage on real stock lengths, welding by process, foundations, envelope, a BOQ and cost, with every number traceable to a formula.

## 2. Goals / Non-goals
**Goals:** a conditional question tree with class-driven defaults; steel takeoff; cutting optimisation with stock-policy options; welding consumables and hours; concrete, rebar and masonry; engineering checks; BOQ and cost with editable rates; live estimate.
**Non-goals:** structural design to IS 800 / IS 875 (future), MEP and electrical (future), drawings.

## 3. User stories
- **US-1**: As a factory owner, I answer about 50 questions with defaults set by my industry class and see the cost update live.
- **US-2**: As a fabricator, I compare standard 12 m bars, best-fit lengths and cut-to-length to minimise cutting loss.
- **US-3**: As a QS, I export the BOQ and replace placeholder rates with Tamil Nadu SOR rates.

## 4. Functional requirements
| Id | Requirement | Priority |
|---|---|---|
| FR-003-01 | Questions shall be shown only when relevant to earlier answers (e.g. no steel stages for an RCC house; industry class only for industrial). | Must |
| FR-003-02 | Every question shall have an expert default derived from earlier answers; untouched answers recompute when an upstream answer changes, and touched answers stay. | Must |
| FR-003-03 | The steel takeoff shall derive members from geometry: bays = round(L ÷ bay), frames = bays + 1, columns = frames × (spans + 1), half-rafters = frames × spans × 2, purlin lines, girt rows, braced bays (every 5 bays, or 4 in seismic zones IV/V, minimum 2), and crane girders. | Must |
| FR-003-04 | Section weights shall use IS 808 nominal kg/m for rolled sections; Z purlins = (h + 2b + 2·lip) × t × 7850/1e6; rods = π d²/4 × 7850/1e6. | Must |
| FR-003-05 | The cutting optimiser shall use first-fit decreasing with kerf per cut, split pieces longer than stock into equal segments with splices, and classify offcuts as reusable (≥ min reuse length) or scrap. | Must |
| FR-003-06 | Stock policies shall be supported: standard 12 m, best of 6/9/10.5/12 m (least metres bought), and cut-to-length (+ premium). Cold-formed sections are always roll-formed to length. | Must |
| FR-003-07 | Charged cutting wastage shall be bought − net − (reuse share × reusable offcuts); plates get an 8% nesting loss. | Must |
| FR-003-08 | Welding shall compute fillet metal (s²/2 × 7850 × 1.1), single-V butt metal ((t²·tan30° + 2t) × 7850 × 1.1), consumable = metal ÷ efficiency, arc h = metal ÷ deposition rate, welder h = arc ÷ operating factor, plus gas, flux and power per process (SMAW/GMAW/FCAW/SAW). | Must |
| FR-003-09 | Weld lengths shall be built from member end connections, gussets, cleats, splices, built-up flange welds, mezzanine, brackets and +10% misc, and listed with formulas. | Must |
| FR-003-10 | Concrete shall include 2.5% wastage; rebar uses kg/m³ ratios by element plus 5% laps and 3% cutting; formwork uses m²/m³ ratios. | Must |
| FR-003-11 | Engineering checks shall compare steel kg/m² with the class range (light 20–32, medium 30–48, heavy 50–110) and flag bay, span, purlin spacing, crane clearance, process-vs-site, high cutting loss and soft soil. | Must |
| FR-003-12 | The cost sheet shall be direct (Σ BOQ) → overhead → contingency → margin → GST → total, plus ₹/m² and ₹/sq ft of built-up area. | Must |
| FR-003-13 | Every rate shall be editable, and changing one shall recalculate the whole estimate. | Must |
| FR-003-14 | Results shall state that section sizes are presets, not a structural design, and that rates are placeholders; scope exclusions shall be listed. | Must |
| FR-003-15 | A live estimate panel shall update on every answer. | Should |
| FR-003-16 | Size answers shall be capped to engineering ranges for the calculation (e.g. length 3–1000 m, width 3–300 m, eave 2–40 m, spans 1–20) and each cap reported as a check; blank or zero sizes shall give zero quantities, never NaN or ∞; unknown option values fall back to the default material. No answer may freeze or crash the engine. (Bug sweep 2026-11-19: 100 000 m length froze the page; unknown wall type crashed it.) | Must |
| FR-003-17 | A market check shall compare the estimate's ₹ per sq ft, plus the typical share of excluded items, with published 2026 Indian turnkey ranges (PEB warehouse ₹1,200–1,900; PEB factory ₹1,200–1,850; heavy factory ₹1,400–3,200; finished RCC house in Tamil Nadu ₹1,700–2,700), and say whether it is in line or should be checked. Section weights shall match IS 808:1989 / mill tables within 1 %. (Accuracy benchmark, 2026-11-19.) | Should |

## 5. Calculations & rules
See FR-003-03…12; constants in `web/src/domains/building/takeoff.js`: SOIL factors 0.85/1/1.25; base plates per class; rebar kg/m³ (footing 70, pedestal 140, plinth 120, column 180, beam 140, slab 90, grade slab 45, stair 100, raft 110); masonry units/m³ (brick 500, AAC 41.7, block 62.5); paint spray loss 30%.

## 6. Acceptance criteria
- **AC-1** (FR-003-03): 60 × 30 m, bay 7.5, 1 span → 8 bays, 9 frames, 18 main columns, 18 × 2 half-rafters.
- **AC-2** (FR-003-05, 07): pieces 10 × 8 m + 4 × 15.3 m on 12 m stock with 3 mm kerf → 18 bars, 4 splices.
- **AC-3** (FR-003-06): for the medium 60 × 30 m default, loss is std > best > ctl.
- **AC-4** (FR-003-08): 6 mm fillet = 0.155 kg/m; SMAW consumable = metal ÷ 0.60.
- **AC-5** (FR-003-11): medium default → steel intensity within 30–48 kg/m² ("ok" check).
- **AC-6** (FR-003-13): doubling the structural steel rate increases the total.
- **AC-7** (FR-003-14): checks include the structural-design disclaimer and scope exclusions.

## 7. Non-functional requirements
- Recalculation in under 50 ms for a 120 × 60 m building in the browser.
- Constitution VI disclaimers are mandatory.

## 8. Open questions / clarifications
| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Replace placeholder rates with Tamil Nadu 2026 SOR? | Yes, future spec | 2026-11-17 |
| 2 | Design sections from loads (IS 800 / 875)? | Future spec | 2026-11-17 |

## 9. Out of scope / future
Section design, electrical (boards, substation, solar), MEP, drawings/IFC export.
