# Spec 015 — Final report download

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-19 |
| **Shipped in** | v0.10.0 |
| **Modes** | both (generated in the browser) |
| **Depends on** | 002 (estimate), 003 (building engine), 012 (sourcing plan), 013 (India only), 014 (raw materials) |

## 0. Mission fit
**Every aspect, a smart solution — in the client's hands.** AK, 2026-11-19: "give an download option to download the final report after the estimation with all possible documentation". The estimate becomes a document the client can keep, share, print and act on.

## 1. Problem
Only a Markdown report and CSV files existed for product estimates, the building engine offered only a BOQ CSV, and the sourcing plan could not be downloaded. A client cannot hand a `.md` file to a bank, a partner or a contractor.

## 2. Goals / Non-goals
**Goals:** a complete, professional **PDF final report** and an **Excel workbook** for product estimates and building results; a PDF of the sourcing plan; every figure identical to the screen.
**Non-goals:** Word (.docx) output; editing the report; e-signature; languages other than English inside the PDF (Indian scripts need shaping that the PDF library does not do — the screen and Excel keep them).

## 3. User stories
- After the estimate, I press **Download final report** and get one PDF with everything: what I asked, my answers, materials, bill of materials, wastage, sourcing, labour, cost sheet, process, compliance, timeline, risks and assumptions.
- I also get the same data as an Excel workbook to work on.
- For a building, the PDF covers the steel schedule, cutting plan, welding, concrete, envelope, BOQ, rates, checks and the market check.

## 4. Functional requirements
| ID | Requirement |
|---|---|
| FR-015-01 | Product estimate results shall show a primary **⇩ Final report (PDF)** button, and the Export menu shall offer Final report (PDF), Workbook (.xlsx), Bill of materials (.csv), Cost sheet (.csv) and Report (.md). |
| FR-015-02 | The product report shall contain: cover; contents; summary (grand total low/likely/high, per unit, market price, key figures); the request and what was understood; every requirement question with its answer, marked when the expert default was used; raw materials; options; bill of materials (all rows, gross qty, rates, amount); wastage by cause; sourcing; labour; one-time costs; per-unit costs; cost sheet with the commercial percentages; quantity breakdowns; process; compliance; timeline; risks; assumptions; engine checks; sources; method and disclaimer. Empty sections are left out. |
| FR-015-03 | Building results shall offer **⇩ Final report (PDF)** and **Workbook (.xlsx)** next to Export BOQ. The building report shall contain: cover; contents; summary (total, ₹ per m² and per sq ft, steel, wastage, weld metal, concrete); inputs by stage; raw materials; geometry; steel schedule; cutting and wastage by section; welding (process, metal, consumables, log); concrete and rebar; envelope and paint; BOQ by package; cost build-up; rates used; engineering checks including the market check; exclusions; method and disclaimer. |
| FR-015-04 | Every number in a report comes from the same code calculation the screen uses (no AI arithmetic): the report's grand total equals the screen's, and BOQ amounts sum to the direct cost. |
| FR-015-05 | The PDF is A4 with a cover page, a contents page with page numbers, a header and "Page x of y" footer on every page, tables that continue across pages with repeated headings, and ₹ and other signs shown correctly (embedded font). |
| FR-015-06 | The workbook has one sheet per section (names ≤ 31 characters, unique), bold heading rows, numbers stored as numbers (₹ and quantity formats), and all text stored as text, never as a formula. |
| FR-015-07 | The sourcing plan in the conversation shall offer **⇩ Download plan (PDF)**, with every option, totals for the chosen quantity, sources and tips. |
| FR-015-08 | Files are offered through the claude.ai downloads capability (the viewer confirms) or, outside claude.ai, a normal browser download; a declined or failed save shows a short message. |
| FR-015-09 | Each report ends with "Method and disclaimer": AI gives knowledge and unit rates, code does all totals; India only, ₹ incl. GST where stated; prices are estimates to confirm with quotes; building sections are typical presets to be designed by a structural engineer; date, app version and price basis. |

## 5. Calculations & rules
None new: the report reuses `calculate()` / `wasteByReason()` (product) and `compute()` (building).

## 6. Acceptance criteria
- AC-1: A product estimate's PDF has a cover, contents and every non-empty section of FR-015-02; its grand total equals the screen's.
- AC-2: A building PDF has every section of FR-015-03 and the market check; BOQ amounts sum to the direct cost.
- AC-3: The workbook opens as a valid .xlsx; cost figures are numeric cells; `=HYPERLINK(...)` text is stored as text, not a formula.
- AC-4: The sourcing plan downloads as a PDF with totals for the chosen quantity.

## 7. Non-functional requirements
Report generation under 3 s for a 200-row BOM; the PDF library and fonts add < 700 KB to the page; no new dependency with known vulnerabilities.

## 8. Open questions / clarifications
| # | Question | Decision |
|---|---|---|
| C1 | PDF only, or also Word? | PDF + Excel (recommended: PDF to share and print, Excel to work on numbers); Word later if asked. |
| C2 | Indian scripts in the PDF? | Not in this version (needs text shaping); the PDF prints any such text as-is where the font has the glyphs. |

## 9. Out of scope / future
Branded letterhead / logo upload; Word export; emailing the report.
