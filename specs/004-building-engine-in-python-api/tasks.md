# Tasks 004 — Building engine in the Python API

**Plan:** [plan.md](./plan.md) · Blocked until spec 004 is **Approved**.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · **[P]** can run in parallel · tests before implementation.

## Phase 0 — Setup
- [ ] T001 Create `shared/building/` and move section table, process table, presets, rebar ratios and default rates into `constants.json`
- [ ] T002 Express the question tree in `questions.json` with the 5-operator rule language; JS loader + vitest regression (spec 003 tests must stay green)
- [ ] T003 Add `npm run gen:cases` to produce `web/tests/fixtures/building_cases.json` (light, medium, heavy, warehouse, house, commercial, std/best/ctl, all 4 weld processes)

## Phase 1 — Tests first (must fail before Phase 2)
- [ ] T010 [P] `engine/tests/test_building_parity.py`: FR-004-02 over all cases
- [ ] T011 [P] `engine/tests/test_building_unit.py`: FR-004-01, FR-004-07 (mirror of building.test.js)
- [ ] T012 [P] `engine/tests/test_building_api.py`: FR-004-03, 04, 05, 06

## Phase 2 — Implementation
- [ ] T020 `domains/building/sections.py`, `questions.py` (loader + rule evaluator) (FR-004-01)
- [ ] T021 `cutting.py` with stable FFD (FR-004-01, 02)
- [ ] T022 `welding.py` (FR-004-01, 02)
- [ ] T023 `takeoff.py` (FR-004-01, 02, 07)
- [ ] T024 API routes `/v1/building/questions`, `/v1/building/estimate` (FR-004-03, 04)
- [ ] T025 Building project store + routes + BOQ CSV export (FR-004-05)
- [ ] T026 `/v1/projects` returns 409 for building routes (FR-004-06)

## Phase 3 — Integration
- [ ] T030 Web: in Engine mode, save building projects to the API (if §8 Q2 is answered yes)
- [ ] T031 README API table, CLAUDE.md code map

## Phase 4 — Verify
- [ ] T090 `python .specify/scripts/spec_check.py --strict 004` passes
- [ ] T091 pytest, vitest and e2e all green
- [ ] T092 Spec → Implemented, Shipped in v0.6.0, specs/README.md updated
