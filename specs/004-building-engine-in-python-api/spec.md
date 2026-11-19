# Spec 004 — Building engine in the Python API

| | |
|---|---|
| **Status** | Draft |
| **Owner** | AK |
| **Created** | 2026-11-17 |
| **Shipped in** | — |
| **Modes** | Engine API (claude.ai mode keeps the browser implementation) |
| **Depends on** | 001, 003 |

## 0. Mission fit
**Any request** from any client app (API), with the same engineered depth as the browser. Parity guarantees one answer everywhere.

## 1. Problem
The Building & industry engine (spec 003) exists only in the browser. Other clients (a mobile app, an ERP, the CLI, a partner's website) can't get a steel takeoff, cutting plan, welding estimate or BOQ through the Engine API, building projects can't be saved on the server, and the router's `building` decision has no API endpoint to hand off to.

## 2. Goals / Non-goals
**Goals**
- The same question tree, defaults and calculations as spec 003, available over REST.
- Results identical to the browser (verified by parity tests).
- Building projects saved, listed and exported like product projects.

**Non-goals**
- New engineering features (section design, electrical, Tamil Nadu rates). Those are separate specs.
- Changing the claude.ai experience.

## 3. User stories
- **US-1**: As an integrator, I POST answers and receive the full takeoff, cutting plans, welding and BOQ as JSON.
- **US-2**: As a client app, I GET the next questions (with defaults and "why") for my current answers, so I can render the interview myself.
- **US-3**: As an estimator, I save a building project, reopen it and download the BOQ CSV.

## 4. Functional requirements
| Id | Requirement | Priority |
|---|---|---|
| FR-004-01 | The Python package shall provide `ultimatum.domains.building` with the question tree, section library, cutting optimiser, welding calculator, takeoff and default rates of spec 003. | Must |
| FR-004-02 | For every case in `web/tests/fixtures/building_cases.json`, Python steel kg, cutting loss %, weld metal kg, concrete m³ and grand total shall match the JS engine within 0.01%. | Must |
| FR-004-03 | `POST /v1/building/questions` with `{answers, touched}` shall return the visible stages and questions with options, units, "why" and the resolved default for each question. | Must |
| FR-004-04 | `POST /v1/building/estimate` with `{answers, touched, rates?}` shall return the full result (geometry, steel members, cutting groups with plans, welding log, concrete, envelope, BOQ, cost, checks). | Must |
| FR-004-05 | Building projects shall be saved, read and updated through `/v1/building/projects` (create, get, patch answers or rates), and exported as BOQ CSV. | Should |
| FR-004-06 | `POST /v1/projects` for a request the router (spec 001) marks as building shall reply 409 with the route and the pre-filled answers, pointing the client to `/v1/building/projects`. | Should |
| FR-004-07 | All spec 003 disclaimers (preset sections, placeholder rates, scope exclusions) shall be present in the API result's `checks`. | Must |

## 5. Calculations & rules
Identical to spec 003 §5. No formula may differ between JS and Python (Constitution IV). Any change to a formula updates both implementations and `building_cases.json` in the same change.

## 6. Acceptance criteria
- **AC-1** (FR-004-02): the medium 60 × 30 m default, light, heavy, warehouse, house and commercial cases all match JS within 0.01%.
- **AC-2** (FR-004-03): posting `{project_type: "house"}` returns no "Steel members" stage; posting `industrial/heavy` returns column default "ISMB 600".
- **AC-3** (FR-004-04): the estimate for the medium default contains 7 cutting groups, a weld log whose lengths sum to the fillet + butt lengths, and a total equal to cost + margin + GST.
- **AC-4** (FR-004-05): create → patch rate → get returns a higher total; BOQ CSV starts with "Category,Item".
- **AC-5** (FR-004-06): POST /v1/projects with "PEB warehouse 80 × 40 m" returns 409 with `route.engine = building`.
- **AC-6** (FR-004-07): checks include "not a structural design".

## 7. Non-functional requirements
- `/v1/building/estimate` responds in under 300 ms for a 120 × 60 m building.
- No AI call is involved in any endpoint of this spec (Constitution II/III).

## 8. Open questions / clarifications
| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Single source for the question tree: move it to a shared JSON file (data) used by both JS and Python, or keep two code copies checked by parity tests? *Recommended: shared JSON for questions and constants; code copies plus parity tests for the formulas.* | — | |
| 2 | Should the web app call this API in Engine mode (server becomes the source of truth), or keep calculating in the browser for instant live updates? *Recommended: keep the browser for live updates, and save to the API.* | — | |
| 3 | Is 0.01% the right parity tolerance? | — | |

## 9. Out of scope / future
Section design (IS 800/875), Tamil Nadu SOR rates import, electrical/MEP modules, PDF BOQ.
