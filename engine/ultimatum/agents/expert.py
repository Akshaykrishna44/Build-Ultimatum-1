"""Expert agent: free-form Q&A grounded in the project's context."""
from __future__ import annotations

from .. import prompts
from ..calc import totals_text
from ..llm import BaseLLM
from ..schemas import Project


class ExpertAgent:
    def __init__(self, llm: BaseLLM, web: bool = True):
        self.llm, self.web = llm, web

    def ask(self, history: list[dict], project: Project | None = None) -> dict:
        """history: [{role, content}, ...] ending with the user's question."""
        totals = ""
        if project and project.estimate and project.pct:
            totals = totals_text(project.estimate, project.request.qty, project.pct, project.request.currency)
        ctx = prompts.expert_context(
            project.request if project else None, project.map if project else None,
            project.answers if project else None, totals)
        msgs = [dict(m) for m in history]
        msgs[0] = {"role": "user", "content": ctx + "\n\nCLIENT QUESTION: " + msgs[0]["content"]}
        r = self.llm.complete(msgs, web_search=self.web, max_tokens=4000)
        return {"answer": r.text, "sources": r.sources}
