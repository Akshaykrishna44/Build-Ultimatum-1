"""Estimator agent: unit-level estimate data (BOM, options, sourcing, labour…) + sanity checks.
It never totals anything; calc.py does."""
from __future__ import annotations

from typing import Any

from .. import prompts
from ..clean import clean_estimate
from ..llm import BaseLLM, LLMError
from ..schemas import Estimate, KnowledgeMap, Percentages, ProjectRequest, Source


def sanitise(est: Estimate) -> tuple[Estimate, list[str]]:
    """Fix impossible values and report what was fixed (warnings shown to the user)."""
    warnings: list[str] = []
    for b in est.bom:
        if not 0 <= b.wastage_pct <= 60:
            warnings.append(f"{b.component}: wastage {b.wastage_pct:g}% looked wrong, clamped")
            b.wastage_pct = min(max(b.wastage_pct, 0), 60)
        if b.consumption_per_unit < 0:
            b.consumption_per_unit = 0
        lo, li, hi = sorted([max(b.rate_low, 0), max(b.rate_likely, 0), max(b.rate_high, 0)])
        if (lo, li, hi) != (b.rate_low, b.rate_likely, b.rate_high):
            warnings.append(f"{b.component}: rates re-ordered low ≤ likely ≤ high")
        b.rate_low, b.rate_likely, b.rate_high = lo, li, hi
    for bd in est.breakdowns:
        s = sum(r.share_pct for r in bd.rows)
        if bd.rows and s and abs(s - 100) > 0.5:
            warnings.append(f"{bd.title}: shares summed to {s:g}%, normalised to 100%")
            for r in bd.rows:
                r.share_pct = round(r.share_pct * 100 / s, 2)
    return est, warnings


def resolve_pct(est: Estimate, answers: dict[str, Any]) -> Percentages:
    p = est.percentages.model_dump()
    for k in ("overhead_pct", "contingency_pct", "margin_pct", "tax_pct"):
        try:
            if answers.get(k) not in (None, ""):
                p[k] = float(answers[k])
        except (TypeError, ValueError):
            pass
    return Percentages(**p)


class EstimatorAgent:
    def __init__(self, llm: BaseLLM, web: bool = True):
        self.llm, self.web = llm, web

    def run(self, req: ProjectRequest, m: KnowledgeMap, answers: dict[str, Any]) -> tuple[Estimate, list[str]]:
        data, sources = self.llm.complete_json(prompts.estimate(req, m, answers, self.web), web_search=self.web)
        if not data.get("bom"):
            raise LLMError("Estimate returned no bill of materials")
        truncated = bool(data.pop("_truncated", False))
        est = Estimate.model_validate(clean_estimate(data))
        est.sources = [Source(**s) for s in sources]
        est, warnings = sanitise(est)
        if truncated:  # rebuilt from the last complete item: say so, never hide it
            warnings.insert(0, "The AI answer was cut off, so the last items may be missing. Re-estimate for a complete bill of materials.")
        return est, warnings
