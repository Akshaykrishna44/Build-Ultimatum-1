"""Universal router: decide which engine handles a request (same rules as web/src/router.js)."""
from __future__ import annotations

import re

from .prompts import PACKS, match_packs
from .schemas import ProjectRequest

R = PACKS["router"]
CAPS = [5, 10, 20, 30, 50]


def _has(text: str, k: str) -> bool:
    return re.search(r"(^|[^a-z])" + re.escape(k) + r"(s|es)?([^a-z]|$)", text) is not None


def _first(text: str, table: dict) -> str | None:
    return next((key for key, words in table.items() if any(_has(text, w) for w in words)), None)


def route(req: ProjectRequest) -> dict:
    text = f" {req.product} {req.notes} ".lower().replace("-", " ")
    is_building = any(_has(text, k) for k in R["building_keywords"])
    ambiguous = not is_building and any(_has(text, k) for k in R["ambiguous_keywords"])
    prefill: dict = {}
    if pt := _first(text, R["project_type"]):
        prefill["project_type"] = pt
    if (ic := _first(text, R["industry_class"])) and prefill.get("project_type", "industrial") == "industrial":
        prefill.update(project_type="industrial", industry_class=ic)
    if m := re.search(r"(\d+)\s*(?:floors?|storeys?|stories)", text):
        prefill["floors"] = int(m.group(1))
    if m := re.search(r"(\d+)\s*(?:t|ton|tons|tonne|tonnes)\s*(?:eot\s*)?crane", text):
        prefill["crane"] = str(min(CAPS, key=lambda c: abs(c - int(m.group(1)))))
    if m := re.search(r"(\d+(?:\.\d+)?)\s*m?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*m\b", text):
        a, b = float(m.group(1)), float(m.group(2))
        prefill.update(length=max(a, b), width=min(a, b))
    packs = match_packs(req)
    return {
        "engine": "building" if is_building else "ai",
        "ambiguous": ambiguous,
        "packs": [p["id"] for p in packs],
        "prefill": prefill,
        "label": "Building & construction engine" if is_building else
                 (" + ".join(p["label"] for p in packs) + " (AI product engine)" if packs else "AI product engine (general)"),
    }
