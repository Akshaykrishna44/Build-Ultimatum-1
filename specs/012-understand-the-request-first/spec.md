# Spec 012 — Understand the request first (any perspective, not only cost)

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-18 |
| **Shipped in** | v0.8.0 (FR-012-11/12 in v0.8.3, FR-012-13/14 in v0.9.3) |
| **Modes** | both |
| **Depends on** | 001 (router), 002 (AI product engine), 003 (building engine), 011 (orb interface) |

## 0. Mission fit
**Any request:** the engine stops treating every input as "manufacture this and cost it". It first understands what the user wants: a question, buying something, making it, building it, planning an event. **Smart solution:** it asks the few clarifying questions an expert would ask *before* doing long work, then offers the paths that fit (buy, make, build, just advise). Meaningless input gets a polite "didn't understand" instead of a research run.

## 1. Problem
Reported by AK on 2026-11-18: whatever is typed, including "need t shirts for an event" or random letters, goes straight into "Identifying the domain → Researching materials → Mapping losses". The app has no understanding step, so it:
- runs an expensive research and estimate on nonsense input,
- assumes every request means *manufacturing with a cost estimate*, when the user may want to **buy**, get **advice**, **plan** something, or ask a **question**,
- asks nothing before starting, so the work can answer the wrong question.

## 2. Goals / Non-goals
**Goals:** detect unclear input without an AI call where possible; one short understanding step that classifies intent; a conversational reply (what I understood + up to 3 clarifying questions with tappable options); the user chooses a path before any long process starts; direct answers for questions.
**Non-goals:** changing estimate calculations, building formulas or rates; a full general-purpose chatbot; voice input.

## 3. User stories
- **US-1**: I type "need t shirts for an event". The engine replies that I want custom T-shirts for an event, asks how many, by when, printed or plain, and my budget, then offers **Buy / get them printed** or **Manufacture them**.
- **US-2**: I type "asdkj" or "hmm". The engine says it didn't understand, shows examples, and starts nothing.
- **US-3**: I ask "which fabric is best for summer T-shirts?". I get a direct expert answer, with an option to turn it into a sourcing plan or estimate.
- **US-4**: I type "PEB warehouse 80 × 40 m". The engine confirms it's a building and opens the building engine in one click, with the details filled in.

## 4. Functional requirements
| Id | Requirement | Priority |
|---|---|---|
| FR-012-01 | Every submitted request shall pass an **understanding step** before any research, estimate or engine opens. No long-running AI process (research, estimate) starts until the user picks a path or confirms. | Must |
| FR-012-02 | A local check (no AI call) shall reject clearly meaningless input: fewer than 3 letters, no vowels in any word, a single repeated character, or keyboard-mash patterns. The engine replies "I didn't understand that", shows 3 example requests, and starts nothing. | Must |
| FR-012-03 | For other input, one short AI call (quick model tier) shall return a structured understanding: `intent` ∈ {question, buy_source, make_manufacture, build_construct, plan_project, estimate_cost, unclear}, a one-sentence summary of what the user wants, 0–3 clarifying questions with tappable options, and the paths to offer. If it returns `unclear`, behave as FR-012-02 with the AI's own reason. | Must |
| FR-012-04 | The reply shall appear as a conversation turn under the orb: "Here's what I understood: …", the clarifying questions (tappable options plus free text), and path buttons such as **Buy / source it**, **Manufacture it**, **Build it**, **Just advise me**. Answers to the questions are carried into the chosen engine as pre-filled answers or context. | Must |
| FR-012-05 | For `question` intent, the engine shall answer directly in the conversation (expert answer), and offer a follow-up path button when one fits (e.g. "Turn this into a sourcing plan"). | Must |
| FR-012-06 | **Buy / source** path: the engine shall produce a sourcing plan for the stated quantity: options (e.g. ready-made vs custom-printed vs made-to-order), where to buy (supplier types, regions, online and B2B), price range per unit and total, MOQ, lead time, customisation and quality tips. Arithmetic (totals) is done in code (Constitution II). | Must |
| FR-012-07 | **Manufacture** and **estimate** paths shall continue into the existing AI product engine (spec 002) with the clarified answers pre-filled. **Build** shall open the building engine (spec 003) with router pre-fill (spec 001). | Must |
| FR-012-08 | Building requests detected by the router shall still show one confirm turn ("This is a building: 80 × 40 m warehouse. Open the building engine?"), and no AI call is needed for that confirmation. A request phrased as a question ("which cement is best for a house?") skips the building confirm and the ambiguous choice and goes to the understanding step, which answers it. (Found while recording the v0.9.3 demo.) | Should |
| FR-012-09 | The orb shall show thinking only during the understanding call or a started process, and asking while waiting for the user's choice (spec 011 states). | Must |
| FR-012-11 | The AI's intent shall be read robustly: any case, common synonyms (make, manufacture, produce, buy, source, purchase, build, construct, plan, estimate, cost, ask), and a reply nested under another key. A reply with an unknown intent but a summary, questions or paths is inferred from its paths, never treated as unclear. If the AI says unclear but the request contains an action word (make, manufacture, build, buy, sell, grow, start, plan, need…) or matches a domain pack, the engine shall not say "I didn't understand"; it shows the understanding turn with all four paths. (Bug: "mobile manufacturing" was answered "I didn't understand", AK 2026-11-19.) | Must |
| FR-012-12 | The Build path shall open the engineered building engine only for the building types it supports (industrial / factory, warehouse, commercial, house), pre-filled with that type. Any other structure (temple, church, mosque, gurudwara, school, hospital, hall, monument, pool…) shall go to the AI engine as a construction project (quantity 1) with the construction domain pack, so the questions fit that structure. The understanding reply carries `building_type`. (Bug: "i have planned to build a hindu temple" opened industrial building questions, AK 2026-11-19.) | Must |
| FR-012-13 | Clear manufacturing requests shall go straight into the expert interview, like v0.5: (a) text that plainly asks to make / manufacture / produce / fabricate / assemble something, with no buying word and not phrased as a question, skips the understanding step with no AI call; (b) when the understanding step reads the intent as make_manufacture or estimate_cost, the interview opens directly with the AI's summary carried as context. Buying, questions, building and unclear requests keep the understanding step. (AK, 2026-11-19: "where is the interview task like the old version" → "both".) | Must |
| FR-012-14 | Every reply that is not "I didn't understand" or the building confirm shall offer the interview in one click: a "Start full requirements" button (renamed from "Start full expert interview", v0.9.5) on direct answers, advice, sourcing plans, the no-AI fallback, and the understanding turn when it has no "Manufacture it" path. | Must |
| FR-012-10 | End task (FR-001-08) shall keep the conversation so it can be resumed; if the AI is unavailable, the local check and router still run and the engine asks the user to choose a path manually. | Must |

## 5. Calculations & rules
- Local meaningless-input check: letters < 3; or every word has no vowel (a, e, i, o, u, y); or ≥ 70% of characters are one character; or the text matches common keyboard runs (e.g. `asdf`, `qwer`, `zxcv`, `jkl`) with no dictionary word ≥ 4 letters.
- Sourcing plan totals: total = unit price × quantity (+ customisation × quantity + delivery); low/likely/high computed in code from the AI's unit-level ranges.

## 6. Acceptance criteria
- **AC-1** (FR-012-02): "asdkj", "hmm", "xxxx", "qwerty" → "I didn't understand", no AI call, orb returns to resting.
- **AC-2** (FR-012-01, 03, 04): "need t shirts for an event" → understanding turn with intent `buy_source` or `plan_project`, ≥ 2 clarifying questions (quantity, date, printing/design, budget), and path buttons; no research has started.
- **AC-3** (FR-012-05): "which fabric is best for summer t-shirts?" → a direct answer; no research or estimate starts.
- **AC-4** (FR-012-06): choosing Buy for 200 T-shirts → sourcing plan with per-unit and total ranges where total = unit × 200.
- **AC-6** (FR-012-11, amended by FR-012-13): "need cricket bats" with an AI reply of intent "unclear" → understanding turn with all four paths; an AI reply of intent "manufacture" → straight into the interview; with an AI reply of "unclear" → understanding turn with all four paths, never "I didn't understand".
- **AC-7** (FR-012-12): "i have planned to build a hindu temple" → Build → the AI interview for a temple (research prompt carries the construction pack and mentions temple), not "What type of project is it?".
- **AC-8** (FR-012-13): "mobile manufacturing" → the interview opens with no understanding call; "500 ICU ventilators" read as make_manufacture → the interview opens, no understanding turn shown.
- **AC-9** (FR-012-14): a direct answer and a sourcing plan each show "Start full requirements", which opens the interview.
- **AC-5** (FR-012-07, 08): "PEB warehouse 80 × 40 m" → confirm turn → building engine with 80 × 40 pre-filled.

## 7. Non-functional requirements
- The first reply (understanding turn) appears in under 10 s; the local check is instant.
- Same readability, motion and keyboard rules as spec 011.

## 8. Open questions / clarifications
| # | Question | Recommended answer | Decision | Date |
|---|---|---|---|---|
| C1 | The live orb version (v0.7, spec 011) exists only as a patched published page; its source isn't in the repo. Where do we build this? | **First port spec 011 (orb UI, light theme, forged-steel palette) into the React source, then build spec 012 there.** One source of truth again; the live look stays the same. | Approved as recommended (AK) | 2026-11-18 |
| C2 | Should building requests also get the confirm turn? | Yes, one click (FR-012-08). | Approved as recommended (AK) | 2026-11-18 |
| C3 | How deep is the Buy / source path in this version? | A sourcing plan in the conversation (FR-012-06), not a full multi-tab estimate. | Approved as recommended (AK) | 2026-11-18 |
| C4 | Meaningless input: local check only, or local + AI? | Local check first (free, instant), AI decides the rest. | Approved as recommended (AK) | 2026-11-18 |

## 9. Out of scope / future
Multi-turn free chat beyond the understanding step, supplier marketplace, live vendor prices, voice.

## 10. Implementation notes (v0.8.0)
- Web: `src/understand.js` (local check, prompts, parsers, sourcing totals), `components/Conversation.jsx` (turns), `components/StartView.jsx` (flow), `engine.js` `understand / sourcing / advise` (understanding uses the quick model tier).
- Python: `ultimatum/understand.py` mirror; `POST /v1/understand` (local check first, no AI call for meaningless input), `POST /v1/sourcing` (totals in code), `POST /v1/advise`.
- The conversation is saved in the browser (`ultimatum-convo-v1`); End task hides it and offers "Resume last conversation".
- Tests: `web/tests/understand.test.js`, `web/tests/e2e/test_understand.py`, `engine/tests/test_understand.py`.
