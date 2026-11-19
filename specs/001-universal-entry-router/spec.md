# Spec 001 — Universal entry & router

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-17 (written retroactively) |
| **Shipped in** | v0.5.0 (FR-001-08 in v0.5.4) |
| **Modes** | both (web `router.js`, API `POST /v1/route`) |
| **Depends on** | 002, 003 |

## 0. Mission fit
**Any request:** one text box accepts anything and routes it to the right engine with the right domain knowledge. **Every aspect:** pre-fills what the sentence already says. End task and readability keep the flow usable.

## 1. Problem
Users ask for anything: a ventilator, a factory building, a house, a crop. Asking them to pick an engine or fill in a form before they've said what they want is friction. The app must take one free-text request, work out which field it belongs to, and send it to the right engine with whatever details the sentence already contains.

## 2. Goals / Non-goals
**Goals:** one text box; automatic field detection; pre-fill from the sentence; explicit choice when the request is ambiguous; identical decisions in JS and Python.
**Non-goals:** AI-based classification (rules are deterministic and offline); multilingual input (future).

## 3. User stories
- **US-1**: As a client, I type "500 ICU ventilators" and immediately get a medical-device expert interview.
- **US-2**: As a builder, I type "PEB warehouse 80 × 40 m" and the building engine opens with warehouse, 80 m and 40 m already set.
- **US-3**: As a user typing "garment factory", I'm asked whether I mean the building or the garments.

## 4. Functional requirements
| Id | Requirement | Priority |
|---|---|---|
| FR-001-01 | The start page shall show exactly one free-text input and an Ask button; no other inputs are required to start. | Must |
| FR-001-02 | A request containing any `router.building_keywords` word (whole word, plural allowed) shall route to the Building engine (spec 003). | Must |
| FR-001-03 | Any other request shall route to the AI product engine (spec 002) together with every domain pack whose keyword matches as a whole word (plural allowed, hyphens treated as spaces). | Must |
| FR-001-04 | A request with an `ambiguous_keywords` word (factory, plant, mill, workshop, industry, manufacturing unit) and no building keyword shall be marked ambiguous, and the UI shall offer "the building" and "the product". | Must |
| FR-001-05 | For building routes, the router shall pre-fill project_type, industry_class, length/width (L = larger dimension of "A × B m"), floors ("N floors/storeys") and crane capacity ("N t crane", rounded to 5/10/20/30/50 t). | Must |
| FR-001-06 | For product routes, the quantity and unit shall be read from the sentence: Indian scales (lakh, crore), thousands separators, and unit words (pairs, pieces, acres, cans, tonnes, kg, litres…); numbers that are sizes or specifications (inch, kVA, 4K, mm, floors, "A × B", t crane) are ignored. If no quantity is found, the interview asks for it (FR-002-04). | Must |
| FR-001-07 | The JS router and the Python router shall return the same engine, ambiguity flag, packs and pre-fill for the shared case file `web/tests/fixtures/router_cases.json`. | Must |
| FR-001-08 | Every screen except home shall show an **End task** button that returns to the home screen. It shall not delete the current work (home offers "Resume last project"), and it shall cancel any running AI step so its result can't navigate away from home. *(added 2026-11-17 at AK's request)* | Must |

## 5. Calculations & rules
- Rules live in `engine/ultimatum/domain_packs.json` → `router` (single source, Constitution IV).
- Word match: `(^|[^a-z]) keyword (s|es)? ([^a-z]|$)` on lower-cased text with hyphens replaced by spaces.
- Crane rounding: nearest of [5, 10, 20, 30, 50].

## 6. Acceptance criteria
- **AC-1** (FR-001-01): Given the start page, then the only form control besides example chips is the text box and Ask button.
- **AC-2** (FR-001-02, 05): Given "Medium-industry factory building 60 × 30 m with 10 t EOT crane", then engine = building and pre-fill = industrial / medium / 60 / 30 / crane "10".
- **AC-3** (FR-001-03): Given "500 ICU ventilators", then engine = ai and packs = [medical]. Given "api server", then packs = [].
- **AC-4** (FR-001-04): Given "garment factory in Tiruppur", then ambiguous = true and both choices are shown.
- **AC-5** (FR-001-06): "10,000 43-inch 4K LED TVs" → 10000 units; "2 lakh T-shirts" → 200000 pieces; "PEB warehouse 80 × 40 m" → no quantity.
- **AC-6** (FR-001-07): every case in `router_cases.json` gives identical results in JS and Python.
- **AC-7** (FR-001-08): From the interview, the building engine, or while the AI is working, clicking End task shows the home text box; Resume last project reopens the work; a cancelled AI step finishing later does not leave home.

## 7. Non-functional requirements
- Routing runs locally in under 5 ms with no network call.
- **Readability (added 2026-11-17, v0.5.3):** all text, including text inside buttons, option boxes and inputs, keeps a contrast ratio of at least 3:1 even when the host forces a dark colour scheme (AK reported white text in boxes). Controls never rely on the browser's default colours. Test: `web/tests/e2e/test_ui.py::test_readable_when_host_forces_dark_mode`.
- **Desktop alignment (added 2026-11-18, v0.5.6):** at 1280–1920 px the home text box is ≥ 600 px wide and centred, the header lines up with the page content, the building side panel stays ≤ 300 px, and there is no horizontal scroll. The stylesheet must have balanced braces. Tests: `test_desktop_alignment`, `web/tests/styles.test.js`.

## 8. Open questions / clarifications
| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Should Tamil and Hindi input be supported? | Future | 2026-11-17 |

## 9. Out of scope / future
AI fallback classifier for requests that no rule matches; multilingual keywords.
