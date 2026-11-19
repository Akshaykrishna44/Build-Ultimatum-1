# Spec 014 — Raw materials first

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-19 |
| **Shipped in** | v0.9.0 |
| **Modes** | both |
| **Depends on** | 002 (AI product engine), 003 (building engine), 012, 013 (India only) |

## 0. Mission fit
**Every aspect:** AK, 2026-11-19: "make this happen for every possible things to display the raw materials needed for this thing in first like a box before the interview questions". Before answering anything, the client sees what the thing is made of, the grades available and where in India each material comes from, so the questions that follow make sense.

## 1. Problem
Raw materials and sources appeared only at the end (estimate tabs) and only on the manufacture path. The building engine showed none.

## 2. Goals / Non-goals
**Goals:** a "Raw materials needed" box at the top of the first interview stage, for every AI request (product, agriculture, construction such as temples) and for the building engine; each material with what it is used for, grades/options, Indian sources, a typical price range, and an imported marker (country of origin) only when nothing suitable is found in India.
**Non-goals:** quantities and totals (they need the client's answers; they stay in the estimate); named, verified suppliers or live prices.

## 3. User stories
- As a client, the first thing I see after asking is the list of materials my product needs and where they come from in India.
- As a building client, I see steel, sheets, cement, rebar, blocks etc. for my chosen structure, updating as I answer.

## 4. Functional requirements
| ID | Requirement |
|---|---|
| FR-014-01 | The research step shall return `raw_materials`: 6–12 rows, each {material, used_for, grades[], india_sources[], typical_price (text, ₹), imported, origin}. No extra AI call. (web and Python) |
| FR-014-02 | Rows are normalised in code: rows without a material dropped, at most 14 rows, lists capped, `origin` kept only when imported. |
| FR-014-03 | The interview shall show a "Raw materials needed" box first on stage 1, before the expert overview and the questions, and the side panel offers "Raw materials (n)" to return to it. Imported rows show "Imported from <origin>". |
| FR-014-04 | The building engine shall show the same box first on its step 1, built in code (no AI) from the current answers: structural steel (IS 2062 grade), cold-formed purlins/girts, roof/wall sheets, fasteners and anchor bolts, welding consumables and paint for steel structures; cement, aggregates/M-sand, TMT rebar (chosen grade) and walling for RCC; it updates live as answers change. |
| FR-014-05 | Every row's price is a typical range for India only (spec 013); the box notes that exact quantities and costs come in the estimate. |

## 5. Calculations & rules
None (display only; totals stay in code in the estimate).

## 6. Acceptance criteria
- AC-1: An AI interview whose map has raw materials shows the box above the first question, with sources.
- AC-2: PEB warehouse with full metal cladding → box lists structural steel E250 (IS 2062), cold-formed sections, roof sheets, fasteners, welding consumables; no bricks (a brick dado wall adds bricks).
- AC-3: House with RCC → cement, TMT Fe500D, walling; no structural steel.

## 7. Non-functional requirements
Same readability rules as spec 011; the box must not push the first question off screen on desktop (compact tiles, ≤ 2 rows visible at 1366 px; scroll is fine).

## 8. Open questions / clarifications
| # | Question | Decision |
|---|---|---|
| C1 | Show the box also in the "Here's what I understood" turn? | No: it would slow the quick read; it comes first in the interview (recommended). |
| C2 | Prices in the box? | Typical ₹ range text for orientation; totals only in the estimate (Constitution II). |

## 9. Out of scope / future
Linking each bill-of-materials row to its source; named supplier directory.
