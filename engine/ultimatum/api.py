"""REST API for the Ultimatum Engine.

Run:  uvicorn ultimatum.api:app --reload --port 8000   (docs at /docs)
Env:  ANTHROPIC_API_KEY, ULTIMATUM_LLM=claude|fake, ULTIMATUM_MODEL, ULTIMATUM_WEB_SEARCH=1|0,
      ULTIMATUM_DB=ultimatum.db, ULTIMATUM_API_TOKEN (optional bearer token), ULTIMATUM_WEB_DIST (built React app)
"""
from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import __version__, exporter
from .engine import NotFound, UltimatumEngine
from .llm import LLMError
from .schemas import ProjectRequest
from .router import route as route_request
from . import understand as und
from .llm import extract_json

app = FastAPI(title="Ultimatum Engine API", version=__version__,
              description="Universal AI domain-expert engine: research → expert interview → complete estimate.")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ULTIMATUM_CORS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])

_engine: Optional[UltimatumEngine] = None


def engine() -> UltimatumEngine:
    global _engine
    if _engine is None:
        _engine = UltimatumEngine()
    return _engine


def auth(authorization: str = Header(default="")):
    token = os.environ.get("ULTIMATUM_API_TOKEN")
    # constant-time comparison, so the token cannot be guessed character by character from response timing
    if token and not hmac.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, "Invalid or missing API token")


def guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except NotFound as e:
        raise HTTPException(404, f"Not found: {e}")
    except KeyError as e:
        raise HTTPException(404, f"Not found: {e}")
    except LLMError as e:
        raise HTTPException(502, f"AI step failed: {e}")


# ── models ──
class CreateBody(BaseModel):
    request: ProjectRequest
    reuse_knowledge: bool = True


class AnswersBody(BaseModel):
    answers: dict[str, Any]
    replace: bool = False


class EditBody(BaseModel):
    estimate: Optional[dict] = None
    pct: Optional[dict] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=6000)


class ChatBody(BaseModel):
    project_id: Optional[str] = Field(None, max_length=64)
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)


class VerifyBody(BaseModel):
    by: str = "expert"
    map: Optional[dict] = None


# ── routes ──
@app.get("/health")
def health():
    e = engine()
    return {"ok": True, "version": __version__, "llm": type(e.llm).__name__, "web_search": e.researcher.web,
            "auth": bool(os.environ.get("ULTIMATUM_API_TOKEN"))}


@app.on_event("startup")
def _warn_open_api():
    # Bug sweep 2026-11-19: a public deployment with a real AI key and no token lets anyone spend the key.
    if os.environ.get("ULTIMATUM_LLM", "claude") != "fake" and not os.environ.get("ULTIMATUM_API_TOKEN"):
        import logging
        logging.getLogger("uvicorn.error").warning(
            "ULTIMATUM_API_TOKEN is not set: anyone who can reach this server can use your AI key. "
            "Set ULTIMATUM_API_TOKEN (and VITE_ENGINE_TOKEN in the web app) before exposing it.")


@app.post("/v1/route", dependencies=[Depends(auth)])
def route(body: ProjectRequest):
    """Which engine should handle this request? (building vs AI product engine, matched domain packs, pre-filled answers)"""
    return route_request(body)


@app.post("/v1/projects", dependencies=[Depends(auth)])
def create_project(body: CreateBody):
    e = engine()
    return e.view(guard(e.create_project, body.request, body.reuse_knowledge))


@app.get("/v1/projects", dependencies=[Depends(auth)])
def list_projects():
    return engine().store.list_projects()


@app.get("/v1/projects/{pid}", dependencies=[Depends(auth)])
def get_project(pid: str):
    e = engine()
    return e.view(guard(e._get, pid))


@app.delete("/v1/projects/{pid}", dependencies=[Depends(auth)])
def delete_project(pid: str):
    if not engine().store.delete_project(pid):
        raise HTTPException(404, "Not found")
    return {"deleted": pid}


@app.put("/v1/projects/{pid}/answers", dependencies=[Depends(auth)])
def put_answers(pid: str, body: AnswersBody):
    e = engine()
    return e.view(guard(e.answer, pid, body.answers, body.replace))


@app.get("/v1/projects/{pid}/next", dependencies=[Depends(auth)])
def next_questions(pid: str):
    return guard(engine().next_questions, pid)


@app.post("/v1/projects/{pid}/stages/{stage_id}/followups", dependencies=[Depends(auth)])
def followups(pid: str, stage_id: str):
    e = engine()
    p, new = guard(e.followups, pid, stage_id)
    return {"project": e.view(p), "new_questions": [q.model_dump() for q in new]}


@app.post("/v1/projects/{pid}/estimate", dependencies=[Depends(auth)])
def estimate(pid: str):
    e = engine()
    p, warnings = guard(e.estimate, pid)
    return {"project": e.view(p), "warnings": warnings}


@app.patch("/v1/projects/{pid}/estimate", dependencies=[Depends(auth)])
def edit_estimate(pid: str, body: EditBody):
    e = engine()
    return e.view(guard(e.update_estimate, pid, body.estimate, body.pct))


@app.get("/v1/projects/{pid}/export/{fmt}", dependencies=[Depends(auth)])
def export(pid: str, fmt: Literal["md", "bom.csv", "cost.csv", "json"]):
    p = guard(engine()._get, pid)
    if fmt != "json" and not p.estimate:
        raise HTTPException(409, "Run the estimate first")
    if fmt == "md":
        return PlainTextResponse(exporter.report_md(p), media_type="text/markdown")
    if fmt == "bom.csv":
        return PlainTextResponse(exporter.bom_csv(p), media_type="text/csv")
    if fmt == "cost.csv":
        return PlainTextResponse(exporter.cost_csv(p), media_type="text/csv")
    return p.model_dump()


# ── Spec 012: understand the request first ──
class UnderstandBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class SourcingBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    notes: str = Field("", max_length=6000)
    qty: float = Field(0, ge=0, le=1e12)


def _llm():
    return engine().llm


@app.post("/v1/understand", dependencies=[Depends(auth)])
def understand_request(body: UnderstandBody):
    """FR-012-02/03: local check first (no AI call), then one short AI call."""
    if und.is_meaningless(body.text)["meaningless"]:
        return und.parse_understanding({"intent": "unclear"})
    res = guard(_llm().complete, und.understand_prompt(body.text), max_tokens=1500)
    try:
        return und.parse_understanding(extract_json(res.text), body.text)
    except Exception:
        raise HTTPException(502, "AI step failed: the understanding was not structured data")


@app.post("/v1/sourcing", dependencies=[Depends(auth)])
def sourcing_plan(body: SourcingBody):
    """FR-012-06: unit-level ranges from the AI; totals for the given quantity computed in code."""
    res = guard(_llm().complete, und.sourcing_prompt(body.text, body.notes, body.qty), max_tokens=4000)
    try:
        plan = und.parse_sourcing(extract_json(res.text))
    except Exception as e:
        raise HTTPException(502, f"AI step failed: {e}")
    for o in plan["options"]:
        o["totals"] = und.sourcing_totals(o, body.qty)
    return plan


@app.post("/v1/advise", dependencies=[Depends(auth)])
def advise(body: SourcingBody):
    res = guard(_llm().complete, und.advise_prompt(body.text, body.notes), max_tokens=1500)
    return {"answer": res.text}


@app.post("/v1/chat", dependencies=[Depends(auth)])
def chat(body: ChatBody):
    if body.messages[-1].role != "user":
        raise HTTPException(422, "messages must end with a user message")
    return guard(engine().ask_expert, body.project_id, [m.model_dump() for m in body.messages])


@app.get("/v1/knowledge", dependencies=[Depends(auth)])
def list_knowledge():
    return engine().store.list_knowledge()


@app.get("/v1/knowledge/{kid}", dependencies=[Depends(auth)])
def get_knowledge(kid: str):
    m = engine().store.get_knowledge(kid)
    if not m:
        raise HTTPException(404, "Not found")
    return m.model_dump()


@app.post("/v1/knowledge/{kid}/verify", dependencies=[Depends(auth)])
def verify_knowledge(kid: str, body: VerifyBody):
    if not engine().verify_knowledge(kid, body.by, body.map):
        raise HTTPException(404, "Not found")
    return {"verified": kid}


# ── serve the built React app (optional) ──
_dist = Path(os.environ.get("ULTIMATUM_WEB_DIST", Path(__file__).resolve().parents[2] / "web" / "dist"))


@app.get("/", include_in_schema=False)
def web_app():
    index = _dist / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"message": "Ultimatum Engine API. Build the web app (cd web && npm run build) or open /docs."}
