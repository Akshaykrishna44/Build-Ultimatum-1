"""Interviewer agent: tracks progress, picks what to ask next, and generates deeper
follow-up questions from the client's specific answers (adaptive interview)."""
from __future__ import annotations

from typing import Any

from .. import prompts
from ..clean import clean_question
from ..llm import BaseLLM
from ..schemas import KnowledgeMap, ProjectRequest, Question, Stage
from .research import normalise_map


def is_answered(q: Question, answers: dict[str, Any]) -> bool:
    v = answers.get(q.id)
    if isinstance(v, list):
        return len(v) > 0
    return v not in (None, "")


def defaults(m: KnowledgeMap) -> dict[str, Any]:
    return {q.id: q.default for s in m.stages for q in s.questions if q.default not in (None, "", [])}


def progress(m: KnowledgeMap, answers: dict[str, Any]) -> dict:
    stages = []
    for s in m.stages:
        done = sum(is_answered(q, answers) for q in s.questions)
        stages.append({"id": s.id, "title": s.title, "answered": done, "total": len(s.questions)})
    total = sum(x["total"] for x in stages)
    answered = sum(x["answered"] for x in stages)
    nxt = next((x["id"] for x in stages if x["answered"] < x["total"]), None)
    return {"answered": answered, "total": total, "complete": answered == total, "next_stage": nxt, "stages": stages}


class InterviewerAgent:
    def __init__(self, llm: BaseLLM):
        self.llm = llm

    def next_questions(self, m: KnowledgeMap, answers: dict[str, Any]) -> dict:
        """The next stage that still has open questions (for chat/CLI style interviews)."""
        for s in m.stages:
            open_qs = [q for q in s.questions if not is_answered(q, answers)]
            if open_qs:
                return {"stage": {"id": s.id, "title": s.title, "intro": s.intro}, "questions": [q.model_dump() for q in open_qs]}
        return {"stage": None, "questions": []}

    def followups(self, req: ProjectRequest, m: KnowledgeMap, answers: dict[str, Any], stage_id: str) -> list[Question]:
        stage = next((s for s in m.stages if s.id == stage_id), None)
        if stage is None:
            raise KeyError(stage_id)
        data, _ = self.llm.complete_json(prompts.followups(req, m, answers, stage))
        new = [Question.model_validate({**c, "followup": True}) for c in (clean_question(q) for q in (data.get("questions") or [])[:3]) if c]
        if not new:
            return []
        stage.questions.extend(new)
        normalise_map(m, req)  # dedupe ids and fix defaults
        ids = {q.id for q in stage.questions[-len(new):]}
        return [q for q in stage.questions if q.id in ids]
