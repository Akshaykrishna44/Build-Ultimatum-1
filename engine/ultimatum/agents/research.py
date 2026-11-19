"""Research agent: domain analysis → knowledge map + expert interview."""
from __future__ import annotations

import re

from .. import prompts
from ..llm import BaseLLM, LLMError
from ..schemas import KnowledgeMap, ProjectRequest, Question, Stage, Source

from ..clean import clean_map
from ..india import DEFAULT_STATE


def normalise_materials(rows) -> list[dict]:
    """Spec 014 FR-014-02: mirror of web/src/materials.js."""
    def s(v):
        return "" if v is None else str(v).strip()

    def lst(v, n):
        v = v if isinstance(v, list) else ([v] if v else [])
        return [s(x) for x in v if s(x)][:n]

    out = []
    for r in [r for r in (rows or []) if isinstance(r, dict) and s(r.get("material"))][:14]:
        imp = r.get("imported") is True or s(r.get("imported")).lower() in ("true", "yes", "y", "1", "imported")
        out.append({"material": s(r["material"]), "used_for": s(r.get("used_for")), "grades": lst(r.get("grades"), 5),
                    "india_sources": lst(r.get("india_sources"), 4), "typical_price": s(r.get("typical_price")),
                    "imported": imp, "origin": s(r.get("origin")) if imp else ""})
    return out

REQUIRED_PCT = {
    "overhead_pct": ("Overhead (factory rent, admin, power, depreciation) as % of direct cost?", 10),
    "contingency_pct": ("Contingency buffer for price rises and surprises?", 5),
    "margin_pct": ("Target profit margin on total cost?", 15),
    "tax_pct": ("GST rate (%) for this product?", 18),
}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "q"


def normalise_map(m: KnowledgeMap, req: ProjectRequest) -> KnowledgeMap:
    """Make the AI's map safe to use: unique ids, valid defaults, required commercial questions."""
    m.raw_materials = normalise_materials(m.raw_materials)  # spec 014
    seen: set[str] = set()
    for i, st in enumerate(m.stages):
        st.id = st.id or f"s{i + 1}"
        for q in st.questions:
            base = _slug(q.id or q.q)
            qid, n = base, 2
            while qid in seen:
                qid, n = f"{base}_{n}", n + 1
            q.id = qid
            seen.add(qid)
            values = [o.value for o in q.options]
            if q.type == "single" and q.default not in values:
                q.default = values[0] if values else None
            if q.type == "multi":
                d = q.default if isinstance(q.default, list) else ([q.default] if q.default is not None else [])
                q.default = [v for v in d if v in values]
            if q.type == "number":
                try:
                    q.default = float(q.default)
                except (TypeError, ValueError):
                    q.default = None
            if q.type in ("single", "multi") and not q.options:
                q.type = "text"
    if "order_qty" not in seen:
        st = next((s for s in m.stages if "quantit" in s.title.lower()), m.stages[0])
        st.questions.insert(0, Question(id="order_qty", q="How many do you need?", type="number", unit=req.unit or "units",
                                        default=req.qty if req.qty > 0 else None,
                                        why="Every material, wastage, labour and packaging figure scales with this"))
    mst = next((s for s in m.stages if "market" in s.title.lower() or "purpose" in s.title.lower()), m.stages[0])
    # Spec 013: India only: no currency question; location is a state or city in India
    for s in m.stages:
        s.questions = [q for q in s.questions if q.id != "currency"]
    loc_q = dict(q="Which state or city in India?", type="text", options=[],
                 why="Local rates, suppliers, wages, GST and state rules depend on the location")
    existing = next((q for s in m.stages for q in s.questions if q.id == "market_location"), None)
    if existing:
        for k, v in loc_q.items():
            setattr(existing, k, v)
    else:
        default = re.sub(r",?\s*india$", "", req.location or "", flags=re.I) or DEFAULT_STATE
        mst.questions.insert(0, Question(id="market_location", default=default, **loc_q))
    missing = [k for k in REQUIRED_PCT if k not in seen]
    if missing:
        commercial = next((s for s in m.stages if "commercial" in s.title.lower()), None)
        if commercial is None:
            commercial = Stage(id=f"s{len(m.stages) + 1}", title="Commercial terms", intro="Money settings for the estimate.")
            m.stages.append(commercial)
        for k in missing:
            text, default = REQUIRED_PCT[k]
            commercial.questions.append(Question(id=k, q=text, type="number", unit="%", default=default, why="Used directly in the cost sheet"))
    return m


class ResearchAgent:
    def __init__(self, llm: BaseLLM, web: bool = True):
        self.llm, self.web = llm, web

    def run(self, req: ProjectRequest) -> KnowledgeMap:
        data, sources = self.llm.complete_json(prompts.research(req, self.web), web_search=self.web)
        if not data.get("stages"):
            raise LLMError("Research returned no interview stages")
        data.pop("_truncated", None)  # a cut-off interview is still usable; stages are cleaned below
        m = KnowledgeMap.model_validate(clean_map(data))
        m.sources = [Source(**s) for s in sources]
        return normalise_map(m, req)
