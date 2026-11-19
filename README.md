# Ultimatum Engine

> **Spec-driven development:** every feature starts as a spec in [`specs/`](specs/README.md), governed by the [constitution](.specify/memory/constitution.md). Workflow and commands are in [`CLAUDE.md`](CLAUDE.md). New feature: `.specify/scripts/new-feature.sh "name"`. Traceability: `python .specify/scripts/spec_check.py --strict`.

A universal AI domain-expert engine. Tell it what you want to manufacture, build, grow or sell. It researches the domain (with live web search), interviews you like a senior domain engineer, asks deeper follow-up questions based on your answers, and produces every option, a full bill of materials with wastage, sourcing regions and prices, labour, machinery, and a low/likely/high cost estimate.

```
ultimatum-engine/
├── engine/                 ← the AI ENGINE (Python)
│   ├── ultimatum/
│   │   ├── engine.py       UltimatumEngine: the orchestrator every client uses
│   │   ├── agents/
│   │   │   ├── research.py     domain research → knowledge map + interview (web search)
│   │   │   ├── interviewer.py  progress, next questions, adaptive follow-ups
│   │   │   ├── estimator.py    BOM / options / sourcing / labour + sanity checks
│   │   │   └── expert.py       grounded Q&A chat
│   │   ├── calc.py         deterministic calculation engine (the AI never totals)
│   │   ├── prompts.py      all prompts
│   │   ├── llm.py          Claude (+ web search) or Fake provider
│   │   ├── store.py        SQLite: projects + knowledge library
│   │   ├── exporter.py     Markdown report, BOM CSV, cost-sheet CSV
│   │   ├── api.py          FastAPI REST API (+ serves the web app)
│   │   └── cli.py          terminal interview
│   └── tests/              pytest (flow, calc, knowledge reuse)
├── web/                    ← React (Vite) client
│   └── src/engine.js       one client, two back ends: Engine API or claude.ai
└── Dockerfile              web build + engine in one container
```

## How the engine thinks

```
request ─► ResearchAgent ─► knowledge map (13 universal stages, domain-specific questions, expert defaults)
              ▲   │                      saved to the KNOWLEDGE LIBRARY; expert-verified maps are reused
              │   ▼
        web search   InterviewerAgent ─► progress · next questions · deeper follow-ups from your answers
                         ▼
                 EstimatorAgent ─► unit-level data (BOM, options, sourcing, labour…) ─► sanity checks
                         ▼
                 calc.py ─► totals: materials, labour, overhead, contingency, margin, tax (low/likely/high)
                         ▼
                 exports · ExpertAgent chat · human edits ─► instant recalculation
```

## Quick start

```bash
# 1. Engine
cd engine
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...        # or ULTIMATUM_LLM=fake to try offline
uvicorn ultimatum.api:app --port 8000       # API docs: http://localhost:8000/docs

# 2. Web app (served by the engine at http://localhost:8000 once built)
cd ../web && npm install && npm run build

# Dev with hot reload: npm run dev  (set VITE_ENGINE_URL=http://localhost:8000)

# Terminal interview
cd ../engine && python -m ultimatum.cli "men's leather formal shoes" 50000 pairs --location "Tamil Nadu"

# Tests
cd engine && ULTIMATUM_LLM=fake python -m pytest -q      # Python (FR-tagged)
cd web && npm test                                       # vitest (FR-tagged)
cd web && npm run build && python -m pytest -q tests/e2e # browser tests (Chromium)
E2E_BROWSER=firefox python -m pytest -q tests/e2e         # same tests in Firefox (or webkit for Safari's engine)
cd web && npx vitest run --coverage                       # coverage report
cd engine && python scripts/real_ai_check.py --research   # real-AI check with YOUR key in ANTHROPIC_API_KEY
cd engine && python scripts/load_test.py --users 200        # load test (start the server first, see the script)
python .specify/scripts/spec_check.py --strict           # every FR has a test

# Docker
docker build -t ultimatum . && docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -v $PWD/data:/data ultimatum
```

## REST API

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Engine status, LLM provider, web search on/off |
| POST | `/v1/projects` | `{request:{product, qty, unit, location, currency, notes}}` → research + interview |
| GET | `/v1/projects` / `/v1/projects/{id}` | List / full project with progress and totals |
| PUT | `/v1/projects/{id}/answers` | Save answers |
| GET | `/v1/projects/{id}/next` | Next open questions (for chat or voice style clients) |
| POST | `/v1/projects/{id}/stages/{stage}/followups` | Adaptive deeper questions |
| POST | `/v1/projects/{id}/estimate` | Run the estimate → project + warnings |
| PATCH | `/v1/projects/{id}/estimate` | Edit rates, wastage or percentages → recalculated totals |
| GET | `/v1/projects/{id}/export/{md,bom.csv,cost.csv,json}` | Exports |
| POST | `/v1/chat` | `{project_id?, messages}` → expert answer + sources |
| GET | `/v1/knowledge` | Knowledge library |
| POST | `/v1/knowledge/{id}/verify` | Mark a map expert-verified (it will be reused for the same product) |

Environment variables are listed in `engine/.env.example`. Set `ULTIMATUM_API_TOKEN` to require `Authorization: Bearer <token>` on all routes under `/v1`. **Always set it before exposing the server**: without it anyone who can reach the server can use your AI key (the server logs a warning, and `/health` reports `"auth": false`).

## Roadmap
1. Live price connectors (IndiaMART / TradeIndia, MCX / NCDEX, Agmarknet, state SOR) feeding `rate_*` with source and date
2. PostgreSQL + user accounts + team projects
3. Expert review UI for the knowledge library
4. Supplier registration, RFQs and quotes matched to BOM lines (marketplace)
5. PDF quotations, multi-language interviews, voice mode
