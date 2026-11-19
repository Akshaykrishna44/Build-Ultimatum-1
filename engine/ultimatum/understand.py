"""Spec 012: understand the request first (Python mirror of web/src/understand.js).

- is_meaningless(): free local check, no AI call (FR-012-02)
- understand_prompt() / parse_understanding(): intent, summary, 0–3 questions, paths (FR-012-03/04/05)
- sourcing plan: the AI gives unit-level ranges; totals are computed here (FR-012-06, Constitution II)
"""
from __future__ import annotations

import re
import unicodedata

from .india import INDIA

_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
_POS = {c: (ri, ci) for ri, r in enumerate(_ROWS) for ci, c in enumerate(r)}
_WORDS = set("""were tree trees free type types rest test tests sad fast last past post pool tool tools wear water weed wet yet your you yours
quote quotes query trek terry jerry dress grass glass gas ask asks fresh desk desks hjkl kill skill skills fill fills well wells
sell sells tell wert retry poetry pottery report reports export exports import imports reuse lass loss less mess press
ware wares ret freer three teeth tee tees treat great greet street sweet sweater sweaters""".split())

INTENTS = ["question", "buy_source", "make_manufacture", "build_construct", "plan_project", "estimate_cost", "unclear"]
PATHS = [("buy", "Buy / source it"), ("make", "Manufacture it"), ("build", "Build it"), ("advise", "Just advise me")]
_LABEL = dict(PATHS)
_DEFAULT_PATHS = {
    "question": ["advise"], "buy_source": ["buy", "make"], "make_manufacture": ["make", "buy"],
    "build_construct": ["build"], "plan_project": ["buy", "make", "advise"], "estimate_cost": ["make", "buy"], "unclear": [],
}


def _mash_like(word: str) -> bool:
    if len(word) < 3 or word in _WORDS:
        return False
    adj = 0
    for a, b in zip(word, word[1:]):
        pa, pb = _POS.get(a), _POS.get(b)
        if pa and pb and pa[0] == pb[0] and abs(pa[1] - pb[1]) <= 1:
            adj += 1
    return adj / (len(word) - 1) >= 0.75


def is_meaningless(text: str) -> dict:
    t = (text or "").strip()
    letters = [c for c in t if unicodedata.category(c).startswith("L")]
    if len(letters) < 3:
        return {"meaningless": True, "reason": "too_short"}
    chars = re.sub(r"\s+", "", t).lower()
    if max(chars.count(c) for c in set(chars)) / len(chars) >= 0.7:
        return {"meaningless": True, "reason": "repeated"}
    latin = re.findall(r"[a-z]+", t.lower())
    non_latin = [c for c in letters if not re.match(r"[a-zA-Z]", c)]
    if latin and not non_latin:
        if all(not re.search(r"[aeiouy]", w) for w in latin):
            return {"meaningless": True, "reason": "no_vowels"}
        words = [w for w in latin if len(w) >= 3]
        if words and all(_mash_like(w) for w in words):
            return {"meaningless": True, "reason": "keyboard"}
    return {"meaningless": False, "reason": ""}


def _slug(s: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", str(s or "").lower()))[:30] or "q"


def understand_prompt(text: str) -> str:
    return f"""UNDERSTAND THE REQUEST
You are the front desk of an expert engine that can advise on, source, manufacture, build, grow or plan anything.
Before any long research or cost estimate starts, work out what the user actually wants. Do not assume they want to manufacture something.

USER WROTE: \"\"\"{str(text)[:600]}\"\"\"
{INDIA}

Return JSON only: {{"intent": one of {INTENTS}, "summary": "one sentence", "reason": "only for unclear",
"answer": "only for question: practical expert answer, max 120 words", "questions": [{{"id": "qty", "q": "...", "options": ["2-5 short answers"]}}],
"paths": ["buy" | "make" | "build" | "advise" or {{"id": "buy", "label": "custom text"}}]}}
"building_type": only for build_construct: industrial | warehouse | commercial | house | other (temple, church, mosque, hall...).
Rules: "unclear" ONLY for random letters, a lone name or a greeting. Short requests are clear ("mobile manufacturing", "rice farming", "temple construction"). 0–3 questions an expert must ask before starting; quantity first with id "qty".
For "question" answer it, ask nothing, and offer a follow-up path only if one fits."""


# FR-012-11: read the AI's intent robustly
_SYNONYMS = [
    (r"unclear|unknown|invalid|gibberish|none|nonsense", "unclear"),
    (r"^question$|^ask|^query|^info|^answer", "question"),
    (r"buy|purchas|sourc|procur|order|supplier", "buy_source"),
    (r"manufact|^make|making|produc|fabricat|assembl", "make_manufacture"),
    (r"build|construct|civil|erect", "build_construct"),
    (r"estim|cost|budget|price|quot", "estimate_cost"),
    (r"plan|project|event|business|start|setup|set_up", "plan_project"),
]
_FROM_PATH = {"buy": "buy_source", "make": "make_manufacture", "build": "build_construct", "advise": "plan_project"}
_ACTION = re.compile(r"\b(make|making|manufactur\w*|produc\w*|build\w*|construct\w*|buy|buying|purchas\w*|sourc\w*|sell\w*|grow\w*|"
                     r"farm\w*|cultivat\w*|start\w*|open\w*|setup|set up|plan\w*|need|needs|want|wants|require\w*|cost|costs|estimate|"
                     r"price|prices|quote|supply|install\w*|business|factory|industry|plant|unit|shop)\b", re.I)
BUILDING_TYPES = ["industrial", "warehouse", "commercial", "house", "other"]


def _norm_intent(v) -> str:
    t = re.sub(r"[^a-z]+", "_", str(v or "").strip().lower())
    if t in INTENTS:
        return t
    if not t:
        return ""
    for pat, iid in _SYNONYMS:
        if re.search(pat, t):
            return iid
    return ""


def looks_like_request(text: str) -> bool:
    from .prompts import match_packs
    from .schemas import ProjectRequest
    t = str(text or "")
    if _ACTION.search(t):
        return True
    return len(t.strip()) >= 2 and bool(match_packs(ProjectRequest(product=t.strip())))


def parse_understanding(raw: dict, text: str = "") -> dict:
    r = raw if isinstance(raw, dict) else {}
    if "intent" not in r:
        inner = next((v for v in r.values() if isinstance(v, dict) and "intent" in v), None)
        if inner:
            r = inner
    raw_paths = []
    for p in r.get("paths") or []:
        p = {"id": p} if isinstance(p, str) else (p if isinstance(p, dict) else {})
        raw_paths.append({**p, "id": str(p.get("id") or "").lower()})
    intent = _norm_intent(r.get("intent"))
    has_content = bool(r.get("summary") or r.get("questions") or raw_paths)
    if not intent:
        intent = next((_FROM_PATH[p["id"]] for p in raw_paths if p["id"] in _FROM_PATH), None) or ("plan_project" if has_content else "unclear")
    overridden = False
    if intent == "unclear" and looks_like_request(text):
        intent, overridden = "plan_project", True
    seen, questions = set(), []
    for q in [q for q in (r.get("questions") or []) if isinstance(q, dict) and q.get("q")][:3]:
        qid = _slug(q.get("id") or q["q"])
        while qid in seen:
            qid += "_2"
        seen.add(qid)
        questions.append({"id": qid, "q": str(q["q"]), "options": [str(o) for o in (q.get("options") or []) if o][:6]})
    paths = [{"id": p["id"], "label": str(p.get("label") or _LABEL[p["id"]])} for p in raw_paths if p["id"] in _LABEL]
    if overridden:
        paths = [{"id": i, "label": l} for i, l in PATHS]
    if not paths:
        paths = [{"id": i, "label": _LABEL[i]} for i in _DEFAULT_PATHS[intent]]
    if intent == "unclear":
        paths = []
    bt = str(r.get("building_type") or "").lower()
    summary = str(r.get("summary") or "") or (f"You want help with: {str(text).strip()}. Choose how to go ahead." if overridden else "")
    return {
        "intent": intent, "summary": summary, "reason": str(r.get("reason") or ""),
        "answer": str(r.get("answer") or "") if intent == "question" else "",
        "questions": [] if intent in ("question", "unclear") else questions, "paths": paths,
        "building_type": bt if bt in BUILDING_TYPES else "",
    }


def advise_prompt(text: str, notes: str = "") -> str:
    return f"""ADVISE THE CLIENT
You are a senior expert across every industry, construction, agriculture, sourcing and events.
Request: \"\"\"{str(text)[:600]}\"\"\"
{('What we clarified: ' + notes) if notes else ''}
{INDIA}
Give practical expert advice in at most 200 words: options, pitfalls, typical prices in ₹ as ranges, GST where it matters, and the next step. Plain text."""


def sourcing_prompt(text: str, notes: str = "", qty: float = 0) -> str:
    return f"""SOURCING PLAN
You are an expert buyer. The client wants to BUY or get this made by a supplier.
Request: \"\"\"{str(text)[:600]}\"\"\"
{('What we clarified: ' + notes) if notes else ''}
Quantity: {qty if qty and qty > 0 else 'not stated (price for a typical small order)'}
{INDIA}
Return JSON only: {{"currency": "INR", "options": [{{"name": "...", "what": "...", "unit_price": {{"low": 0, "likely": 0, "high": 0}},
"customisation_per_unit": {{...}}, "delivery_total": {{...}}, "moq": "...", "lead_time": "...", "where": ["..."], "notes": "..."}}], "tips": ["..."]}}
2 to 4 options with per-unit prices. Do NOT compute any totals: the app does the arithmetic."""


def _range(v) -> dict:
    o = v if isinstance(v, dict) else {"likely": v}

    def n(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    lo, li, hi = n(o.get("low")), n(o.get("likely")), n(o.get("high"))
    if li is None:
        li = (lo + hi) / 2 if lo is not None and hi is not None else lo if lo is not None else hi if hi is not None else 0.0
    lo = li if lo is None else lo
    hi = li if hi is None else hi
    a, b, c = sorted([lo, li, hi])
    return {"low": a, "likely": b, "high": c}


def parse_sourcing(raw: dict) -> dict:
    r = raw if isinstance(raw, dict) else {}
    options = []
    for o in [o for o in (r.get("options") or []) if isinstance(o, dict) and o.get("name")][:4]:
        options.append({
            "name": str(o["name"]), "what": str(o.get("what") or ""),
            "unit_price": _range(o.get("unit_price")),
            "customisation_per_unit": _range(o.get("customisation_per_unit", 0)),
            "delivery_total": _range(o.get("delivery_total", 0)),
            "moq": str(o.get("moq") or ""), "lead_time": str(o.get("lead_time") or ""),
            "where": [str(w) for w in (o.get("where") or [])][:6], "notes": str(o.get("notes") or ""),
        })
    if not options:
        raise ValueError("The sourcing plan came back empty. Please retry.")
    return {"currency": str(r.get("currency") or "INR"), "options": options, "tips": [str(t) for t in (r.get("tips") or [])][:6]}


def sourcing_totals(opt: dict, qty: float) -> dict:
    """total = unit × qty + customisation × qty + delivery, for low / likely / high."""
    q = max(0.0, float(qty or 0))
    out = {}
    for s in ("low", "likely", "high"):
        unit = opt["unit_price"][s]
        custom = opt.get("customisation_per_unit", {}).get(s, 0) or 0
        delivery = opt.get("delivery_total", {}).get(s, 0) or 0
        total = unit * q + custom * q + delivery
        out[s] = {"unit": unit, "custom": custom, "delivery": delivery, "total": total, "per_unit": total / q if q else 0}
    return out
