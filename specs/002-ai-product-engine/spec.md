# Spec 002 — AI product engine (any product, any domain)

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-17 (written retroactively) |
| **Shipped in** | v0.5.0 (FR-002-16 in v0.5.2) |
| **Modes** | both (claude.ai built-in Claude; Python Engine API with web search) |
| **Depends on** | 001 |

## 0. Mission fit
**Any request:** researches any product with domain packs. **Every aspect:** 15 stages from classification to risk, multi-level BOM, packaging, wastage by cause. **Smart solution:** options catalog, low/likely/high, market comparison, expert chat.

## 1. Problem
Clients need a domain expert who asks the right questions for *their* product: a ventilator, TVs, shoes, food or crops. Then they need every option, a multi-level bill of materials, wastage by cause, sourcing and market prices, and a full cost. No fixed form can cover every product, so an AI researches the domain. That AI must be constrained so its numbers stay honest and the arithmetic stays deterministic.

## 2. Goals / Non-goals
**Goals:** a domain-aware interview from classification to commercial terms; multi-level BOM with packaging; wastage by cause; low/likely/high totals computed in code; edits recalculate; exports; knowledge reuse.
**Non-goals:** guaranteed live market prices in claude.ai mode (no web search there); legal or regulatory approval.

## 3. User stories
- **US-1**: As a client, I answer expert questions with sensible defaults, so I don't need to be an expert myself.
- **US-2**: As an estimator, I edit consumption, wastage and rates and see totals update instantly.
- **US-3**: As an owner, I reuse an expert-verified knowledge map for the same product without paying for research again.

## 4. Functional requirements
| Id | Requirement | Priority |
|---|---|---|
| FR-002-01 | Research shall produce a knowledge map whose interview follows the universal stage order (Classification & intended use → Purpose & market → … → Packaging & logistics → Commercial terms → Risk), with matching domain-pack stages inserted after Classification. | Must |
| FR-002-02 | The expert guidance of the universal rules and every matched domain pack shall be injected into the research and estimate prompts. | Must |
| FR-002-03 | The map shall be normalised before use: unique question ids, defaults valid for their type, and overhead_pct, contingency_pct, margin_pct and tax_pct questions added when missing. | Must |
| FR-002-04 | The interview shall always contain order_qty and market_location questions; their answers shall update the request (qty, unit, location) before the estimate runs. *(Amended by spec 013, v0.8.1: no currency question; always INR, location in India.)* | Must |
| FR-002-05 | Every question with a default shall be pre-answered with it, and unanswered questions use the default. | Must |
| FR-002-06 | The interviewer shall add 0–3 deeper follow-up questions to a stage on request, based on the answers so far, with no duplicate ids. | Should |
| FR-002-07 | The estimate shall carry a multi-level BOM (assembly, category raw_material/component/sub_assembly/consumable/packaging, make_or_buy, wastage_pct, wastage_reason, rate low/likely/high); an estimate without a BOM is rejected. | Must |
| FR-002-08 | Estimates shall be sanitised in both modes (web and Python; the web had skipped this until the 2026-11-19 bug sweep): wastage clamped to 0–60%, rates re-ordered to low ≤ likely ≤ high, and mix shares normalised to 100%, with a warning for each fix. | Must |
| FR-002-09 | Totals shall be computed only by the calculation core with identical results in JS (`calc.js`) and Python (`calc.py`). | Must |
| FR-002-10 | Edits to the estimate or percentages shall recalculate totals (API: PATCH). | Must |
| FR-002-11 | Exports shall be available as a Markdown report, BOM CSV, cost-sheet CSV and project JSON. | Should |
| FR-002-12 | Every knowledge map shall be saved; a map marked verified shall be reused for the same normalised product key. | Should |
| FR-002-13 | `web/src/domainPacks.json` shall be identical to `engine/ultimatum/domain_packs.json`. | Must |
| FR-002-14 | Wastage shall be reported by cause: value lost = (gross − net) × likely rate, grouped by wastage_reason, sorted by value. | Must |
| FR-002-15 | The expert chat shall answer with the project's request, answers and current totals as context. | Should |
| FR-002-16 | The "Estimate" step in the header shall always be clickable once the interview exists; if no estimate exists yet, clicking it generates one from the current answers (expert defaults for unanswered questions). *(added 2026-11-17: AK couldn't reach the estimation page because the step was greyed out)* | Must |
| FR-002-17 | The AI's interview map and estimate shall be normalised in code before any screen or calculation uses them: lists are lists, text is text, numbers are numbers ≥ 0 (percentages ≤ 100 %; wastage then follows FR-002-08 in both modes), rate low ≤ likely ≤ high, options given as plain words become buttons, invalid question types fall back safely, rows without a name are dropped. Old saved projects are cleaned on load. Partial or messy AI output shall never crash a screen. (Bug sweep, 2026-11-19.) | Must |

## 5. Calculations & rules
- Gross = net ÷ (1 − w%), w clamped to 0–95% · net = consumption/unit × qty
- Materials = Σ gross × rate · Labour = Σ min/unit × qty ÷ 60 × rate/h
- Direct = materials + labour + one-time (charged) + per-unit costs × qty
- Overhead = direct × OH% · Contingency = (direct + OH) × C% · Cost = direct + OH + C
- Margin = cost × M% · Tax = (cost + margin) × T% · Total = cost + margin + tax
- Scenarios low/likely/high vary material rates only.

## 6. Acceptance criteria
- **AC-1** (FR-002-01, 02): A ventilator request gives stage list with "Intended use & regulatory class" second, and the prompt contains "CDSCO".
- **AC-2** (FR-002-04): A project created without qty asks order_qty; answering 1200 / "Agra" gives request qty 1200, location "Agra, India", currency INR at estimate time (spec 013).
- **AC-3** (FR-002-08): wastage 300% → 60% with a warning; rates 100/50/80 → 50/80/100.
- **AC-4** (FR-002-09): one BOM line 1 × 10 at 0% waste, qty 100, OH 10% → total 1100 in both JS and Python.
- **AC-5** (FR-002-14): two lines with reasons A and B give byReason sorted by value lost.
- **AC-6** (FR-002-16): Given an interview with no estimate yet, when the user clicks "2 · Estimate", then the estimate is generated and the results page opens.

## 7. Non-functional requirements
- Constitution VI: claude.ai mode labels prices as AI estimates; API mode shows web sources.
- A full research or estimate call should finish in under 120 s.

## 8. Open questions / clarifications
| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Live price connectors (IndiaMART, MCX/NCDEX, Agmarknet)? | Future spec | 2026-11-17 |

## 9. Out of scope / future
Live price feeds, supplier marketplace, PDF quotations.
