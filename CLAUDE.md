# Ultimatum Engine — working rules for AI agents and developers

**Mission: any request, every aspect, a smart solution.** We are training this engine to handle anything a user asks, in every aspect, and give smart, expert-level solutions.

This repo uses **spec-driven development (SDD)**. Read `.specify/memory/constitution.md` first: it overrides everything else here.

## The workflow
1. **Specify:** `.specify/scripts/new-feature.sh "feature name"` creates `specs/NNN-name/`. Write `spec.md` (mission fit, problem, goals, user stories, FR table, formulas, acceptance criteria). Status **Draft**.
2. **Clarify:** list open questions in §8 of the spec and get answers from AK. Status **Clarifying** → **Approved** (AK only).
3. **Plan:** write `plan.md`, including the constitution check, files, contracts in `contracts/`, and test strategy.
4. **Tasks:** write `tasks.md` with tests before implementation; mark [P] for parallel tasks.
5. **Implement:** work task by task. Tag every test with the FR ids it proves (`# FR-003-07` / `// FR-003-07`).
6. **Verify:** run `python .specify/scripts/spec_check.py --strict` and all test suites, then set the spec status to **Implemented**, fill in "Shipped in", and update `specs/README.md`.

Do not write feature code for a spec that isn't **Approved**. If you find a behaviour that no spec covers, write or amend the spec first.

## Commands
```bash
# Python engine
cd engine && ULTIMATUM_LLM=fake python -m pytest -q
# Web
cd web && npm test          # vitest
cd web && npm run build     # single-file dist/index.html
# Traceability
python .specify/scripts/spec_check.py [--strict] [NNN]
```

## Map of the code
- `web/src/router.js`, `engine/ultimatum/router.py`: spec 001
- `web/src/ai.js`, `web/src/engine.js`, `engine/ultimatum/{prompts,agents,engine,api}.py`, `domain_packs.json`: spec 002
- `web/src/domains/building/*`, `web/src/components/building/*`: spec 003
- `web/src/calc.js`, `engine/ultimatum/calc.py`: shared calculation core (specs 002, 003)

## House rules
- `engine/ultimatum/domain_packs.json` is the source; `web/src/domainPacks.json` is a copy checked by a parity test. Edit the source and copy it.
- The AI never totals. If you're about to ask the model to add numbers, stop (Constitution II).
- Rates in `web/src/domains/building/rates.js` are placeholders; keep the label (Constitution VI).
