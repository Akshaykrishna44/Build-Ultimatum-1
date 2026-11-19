"""UltimatumEngine — the orchestrator. One object that any front end (REST API, CLI, mobile,
ERP plug-in) uses:

    eng = UltimatumEngine()
    p   = eng.create_project(ProjectRequest(product="leather shoes", qty=50000, unit="pairs"))
    eng.answer(p.id, {"shoe_type": "oxford"})
    eng.followups(p.id, "s1")             # adaptive deeper questions
    eng.estimate(p.id)                    # AI data + deterministic totals
    eng.update_estimate(p.id, {...})      # human edits → instant recalculation
    eng.ask_expert(p.id, [{"role":"user","content":"How do I cut wastage?"}])
"""
from __future__ import annotations

from .india import indian_location

import uuid
from typing import Any, Optional

from .agents import EstimatorAgent, ExpertAgent, InterviewerAgent, ResearchAgent
from .agents.estimator import resolve_pct
from .agents.interviewer import defaults, progress
from .calc import calculate
from .llm import BaseLLM, get_llm, web_search_enabled
from .schemas import Estimate, KnowledgeMap, Percentages, Project, ProjectRequest
from .store import Store, now


class NotFound(KeyError):
    pass


class UltimatumEngine:
    def __init__(self, llm: Optional[BaseLLM] = None, store: Optional[Store] = None, web: Optional[bool] = None):
        self.llm = llm or get_llm()
        self.store = store or Store()
        web = web_search_enabled() if web is None else web
        self.researcher = ResearchAgent(self.llm, web)
        self.interviewer = InterviewerAgent(self.llm)
        self.estimator = EstimatorAgent(self.llm, web)
        self.expert = ExpertAgent(self.llm, web)

    # ── helpers ──
    def _get(self, pid: str) -> Project:
        p = self.store.get_project(pid)
        if not p:
            raise NotFound(pid)
        return p

    def view(self, p: Project) -> dict:
        """Project plus derived data (progress + calculated totals), ready for any client."""
        d = p.model_dump()
        d["progress"] = progress(p.map, p.answers) if p.map else None
        d["totals"] = calculate(p.estimate, p.request.qty, p.pct) if p.estimate and p.pct else None
        return d

    # ── 1. research ──
    def create_project(self, req: ProjectRequest, reuse_knowledge: bool = True) -> Project:
        hit = self.store.find_verified(req.product) if reuse_knowledge else None
        if hit:
            kid, m = hit
            reused = True
        else:
            m = self.researcher.run(req)
            kid = "k_" + uuid.uuid4().hex[:10]
            self.store.save_knowledge(kid, req.product, m)
            reused = False
        ts = now()
        p = Project(id="p_" + uuid.uuid4().hex[:12], created_at=ts, updated_at=ts, request=req, map=m,
                    answers=defaults(m), knowledge_id=kid, reused_knowledge=reused)
        return self.store.save_project(p)

    # ── 2. interview ──
    def answer(self, pid: str, answers: dict[str, Any], replace: bool = False) -> Project:
        p = self._get(pid)
        p.answers = dict(answers) if replace else {**p.answers, **answers}
        return self.store.save_project(p)

    def next_questions(self, pid: str) -> dict:
        p = self._get(pid)
        return self.interviewer.next_questions(p.map, p.answers)

    def followups(self, pid: str, stage_id: str) -> tuple[Project, list]:
        p = self._get(pid)
        new = self.interviewer.followups(p.request, p.map, p.answers, stage_id)
        for q in new:
            if q.default not in (None, "", []):
                p.answers.setdefault(q.id, q.default)
        return self.store.save_project(p), new

    # ── 3. estimate ──
    def estimate(self, pid: str) -> tuple[Project, list[str]]:
        p = self._get(pid)
        # The order quantity comes from the interview answer (the request may not state one)
        qq = next((q for s in p.map.stages for q in s.questions if q.id == "order_qty"), None)
        try:
            qty = float(p.answers.get("order_qty") or 0)
        except (TypeError, ValueError):
            qty = 0
        p.request.qty = qty or p.request.qty or 1
        if qq and qq.unit:
            p.request.unit = qq.unit
        if p.answers.get("market_location"):
            p.request.location = indian_location(str(p.answers["market_location"]))
        p.request.currency = "INR"  # spec 013
        est, warnings = self.estimator.run(p.request, p.map, p.answers)
        p.estimate, p.pct = est, resolve_pct(est, p.answers)
        return self.store.save_project(p), warnings

    def update_estimate(self, pid: str, estimate: Optional[dict] = None, pct: Optional[dict] = None) -> Project:
        """Human edits (rates, wastage, quantities, percentages). Totals recalculate in view()."""
        p = self._get(pid)
        if estimate is not None:
            p.estimate = Estimate.model_validate({**(p.estimate.model_dump() if p.estimate else {}), **estimate})
        if pct is not None:
            p.pct = Percentages.model_validate({**(p.pct.model_dump() if p.pct else {}), **pct})
        return self.store.save_project(p)

    # ── 4. expert chat ──
    def ask_expert(self, pid: Optional[str], history: list[dict]) -> dict:
        return self.expert.ask(history, self._get(pid) if pid else None)

    # ── knowledge library ──
    def verify_knowledge(self, kid: str, by: str = "expert", m: Optional[dict] = None) -> bool:
        return self.store.verify_knowledge(kid, by, KnowledgeMap.model_validate(m) if m else None)
