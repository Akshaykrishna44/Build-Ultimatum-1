# Specs

> **Mission:** any request, every aspect, a smart solution (constitution v1.1.0).

Spec-driven development: see [`CLAUDE.md`](../CLAUDE.md) for the workflow and [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) for the rules.

| # | Feature | Status | Shipped | FRs | Tested |
|---|---|---|---|---|---|
| [001](./001-universal-entry-router/spec.md) | Universal entry & router | Implemented | v0.5.4 | 8 | 8 |
| [002](./002-ai-product-engine/spec.md) | AI product engine | Implemented | v0.5.2 | 16 | 16 |
| [003](./003-building-engine/spec.md) | Building & industry engine | Implemented | v0.3.0 | 15 | 15 |
| [004](./004-building-engine-in-python-api/spec.md) | Building engine in the Python API | **Draft**, awaiting AK | — | 7 | 0 |
| [011](./011-orb-interface/spec.md) | Orb interface, light theme | Implemented | v0.7.0 (source v0.8.0) | 12 | 12 |
| [012](./012-understand-the-request-first/spec.md) | Understand the request first | Implemented | v0.8.0 (v0.8.3, v0.9.3) | 14 | 14 |
| [015](./015-final-report/spec.md) | Final report download (PDF + Excel) | Implemented | v0.10.0 | 9 | 9 |
| [014](./014-raw-materials-first/spec.md) | Raw materials first (box before the questions) | Implemented | v0.9.0 | 5 | 5 |
| [013](./013-india-only/spec.md) | India only (₹, GST, Indian suppliers and rules) | Implemented | v0.8.1 | 5 | 5 |

Run `python .specify/scripts/spec_check.py` for the live coverage table.

## Backlog (candidate specs)
- 005 Tamil Nadu 2026 rates / SOR import with source and date
- 006 Live market prices (IndiaMART, MCX/NCDEX, Agmarknet) with source and date
- 007 Structural section design (IS 800 / IS 875) replacing presets
- 008 Electrical module (boards, substation, solar)
- 009 PDF BOQ / quotation export
- 010 Accounts, PostgreSQL, team projects

## Changelog
| Version | Date | Specs |
|---|---|---|
| v0.10.0 | 2026-11-19 | 015 (AK): "Final report (PDF)" after every estimate: cover, contents, page numbers, every section (requirements and answers, raw materials, bill of materials, wastage, sourcing, labour, cost sheet, process, compliance, timeline, risks, assumptions, checks, sources, method); building report with steel, cutting, welding, concrete, envelope, BOQ, cost build-up, rates and market check; Excel workbook (one sheet per section, numbers as numbers); sourcing plan PDF. Embedded font for ₹; wide tables on landscape pages; 0 vulnerable dependencies. |
| v0.9.5 | 2026-11-19 | Wording (AK): "Interview" renamed "Requirements" in the step label ("1 · Requirements"), the button ("Start full requirements") and the loading message ("Preparing your requirements"). |
| v0.9.4 | 2026-11-19 | Two bugs found while recording the demo video: a question that mentions a house or factory ("which cement is best for a house?") was sent to the building engine instead of being answered (FR-012-08 amended); a new screen kept the previous scroll position, so the interview could open past the raw materials box (now always opens at the top). |
| v0.9.3 | 2026-11-19 | 012 (AK, "both"): FR-012-13 clear manufacturing requests go straight into the expert interview like v0.5 (plain make/manufacture wording skips the AI read; an AI read of make/estimate opens the interview directly); FR-012-14 "Start full expert interview" button on every reply (answers, advice, sourcing plans, understanding turn). |
| v0.9.2 | 2026-11-19 | Testing round 2. Fixed: concurrent users broke the Python engine's database (shared SQLite connection → 500 errors under load; now one connection per thread + WAL); AI source links could run javascript: code (http/https only); token compared in constant time; package version stale. Real-AI output reader rebuilt (web + Python, same 15 cases): prose/fences, braces in prose, example objects, comments, trailing commas, curly quotes, NaN, cut-off answers rebuilt and flagged. Answer buttons grouped under their question for screen readers. New: accuracy benchmark vs IS 808 and published 2026 Indian rates + market check on building results (FR-003-17); load test script (200 simultaneous users, 3,200 requests, 0 errors); dependency audit (0 vulnerabilities). |
| v0.9.1 | 2026-11-19 | Whole-project bug sweep. Fixed: absurd building sizes froze/crashed the page (sizes capped, reported; huge cutting jobs sampled) — FR-003-16; blank size showed ₹∞/m²; unknown wall type crashed the building screen; messy AI estimates/interviews could crash the results/interview screens (code normalisers, web + Python) — FR-002-17; web skipped the FR-002-08 sanitising (wastage ≤ 60 %, rates order, shares) so totals could differ from the Python engine; saved building rates lost newer rate lines (₹0); unlabelled input boxes (accessibility); API without size limits / chat shape checks; open-API warning; CSV formula injection; long chats trimmed. New tests: fuzzing, messy-AI flow, accessibility audit on 18 screens, phone flows, keyboard-only, downloads, Tamil/Hindi, long input, injection; coverage report; real-AI check script; E2E_BROWSER switch. |
| v0.9.0 | 2026-11-19 | 014 (AK): "Raw materials needed" box first, before the interview questions, for every request: AI requests get 6–12 materials from the research step (grades, Indian sources, typical ₹ price, imported marker); the building engine builds its list in code from live answers (steel, purlins, sheets, fasteners, welding, paint, cement, aggregates, TMT, walling). |
| v0.8.3 | 2026-11-19 | 012 fixes (AK): FR-012-11 robust intent reading, real requests never get "I didn't understand" ("mobile manufacturing"); FR-012-12 Build path opens the building engine only for factory / warehouse / commercial / house, other structures (temples, churches, halls...) get an AI construction interview; new construction domain pack; phone keywords added to electronics. |
| v0.8.2 | 2026-11-18 | 013 C1 confirmed by AK: India first; outsource from abroad only when nothing is found in India (country of origin, importer, customs duty, lead time). |
| v0.8.1 | 2026-11-18 | 013: India only (AK). No currency question, always ₹ and GST; location = state or city in India; every prompt India-only (Indian regulators, standards, suppliers, clusters); export rules removed from domain packs. 002 FR-002-04 amended. |
| v0.8.0 | 2026-11-18 | 012: understanding step before any research (local "didn't understand" check, quick AI read of intent, clarifying questions, Buy / Manufacture / Build / Advise paths, sourcing plan with code totals, building confirm turn, resumable conversation; Python `/v1/understand`, `/v1/sourcing`, `/v1/advise`). 011 ported from the published page into the React source (pixel-equal to v0.7.2). |
| v0.7.2 | 2026-11-18 | 011: forged-steel orb palette (built from the published page, not the repo) |
| v0.7.0 | 2026-11-18 | 011: orb interface, light theme |
| v0.5.6 | 2026-11-18 | Fix: desktop layout broken by an unclosed `@media` rule introduced in v0.5.5; header aligned with content; layout and stylesheet tests (spec 001 §7) |
| v0.5.5 | 2026-11-18 | UI: removed the "● Claude" engine badge from the header (AK) |
| v0.5.4 | 2026-11-17 | 001 FR-001-08: End task button on every screen → home (work kept, AI step cancelled); resume last project / building |
| v0.5.3 | 2026-11-17 | Fix: text in boxes turned white in dark mode; explicit control colours, darker amber text (spec 001 §7) |
| v0.5.2 | 2026-11-17 | 002 FR-002-16: "2 · Estimate" step always clickable (generates the estimate if missing) |
| — | 2026-11-17 | v0.6.0 (spec 004 implemented) **rolled back at AK's request**; archived as `ultimatum-engine-v0.6.0.tar.gz`. Spec 004 returns to Draft. |
| v0.5.0 | 2026-11-17 | 001 single text box; 002 location/currency/qty in the interview |
| v0.4.0 | 2026-11-17 | 001 router + pre-fill; 002 domain packs, multi-level BOM, wastage by cause |
| v0.3.0 | 2026-11-17 | 003 building engine |
| v0.2.0 | 2026-11-17 | 002 Python engine, API, knowledge library |
| v0.1.0 | 2026-11-17 | 002 first web app |
