"""Bug sweep 2026-11-19 (FR-002-17): clean the AI's raw JSON before pydantic validation, so one messy value
("1,200", a missing name, options given as plain words, an unknown question type) cannot fail the whole step.
Mirror of web/src/estimate.js."""
from __future__ import annotations

import json
import re
from typing import Any

TYPES = ("single", "multi", "number", "text")


def num(v) -> float:
    if isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v) if v == v and v not in (float("inf"), float("-inf")) else 0.0
    try:
        return float(re.sub(r"[,\s₹]", "", str(v or "")))
    except ValueError:
        return 0.0


def pos(v, hi: float = float("inf")) -> float:
    return min(max(num(v), 0.0), hi)


def txt(v) -> str:
    if v is None:
        return ""
    return json.dumps(v) if isinstance(v, (dict, list)) else str(v)


def arr(v) -> list:
    return v if isinstance(v, list) else []


def obj(v) -> dict:
    return v if isinstance(v, dict) else {}


def ordered(lo, li, hi, sort: bool = True) -> tuple[float, float, float]:
    vals = [pos(lo), pos(li), pos(hi)]
    known = [x for x in vals if x > 0]
    if not known:
        return 0.0, 0.0, 0.0
    mid = vals[1] or ((vals[0] + vals[2]) / 2 if vals[0] and vals[2] else known[0])
    out = [vals[0] or mid, mid, vals[2] or mid]
    a, b, c = sorted(out) if sort else out
    return a, b, c


def clean_estimate(raw: Any) -> dict:
    e = dict(obj(raw))
    bom = []
    for b in arr(e.get("bom")):
        if not isinstance(b, dict) or not (b.get("component") or b.get("material")):
            continue
        lo, li, hi = ordered(b.get("rate_low"), b.get("rate_likely"), b.get("rate_high"), sort=False)  # sanitise() sorts + warns
        bom.append({**b, "component": txt(b.get("component") or b.get("material")), "material": txt(b.get("material")),
                    "consumption_per_unit": pos(b.get("consumption_per_unit")), "wastage_pct": num(b.get("wastage_pct")),
                    "rate_low": lo, "rate_likely": li, "rate_high": hi,
                    **{k: txt(b.get(k)) for k in ("assembly", "grade", "unit", "wastage_reason", "note")},
                    "category": txt(b.get("category") or "component"), "make_or_buy": txt(b.get("make_or_buy") or "buy")})
    e["bom"] = bom
    e["options_catalog"] = [
        {**c, "category": txt(c["category"]), "options": [{**o, "name": txt(o["name"])} for o in arr(c.get("options")) if isinstance(o, dict) and o.get("name")]}
        for c in arr(e.get("options_catalog")) if isinstance(c, dict) and c.get("category")]
    e["options_catalog"] = [c for c in e["options_catalog"] if c["options"]]
    e["breakdowns"] = [
        {**b, "title": txt(b["title"]), "rows": [{"label": txt(r["label"]), "share_pct": pos(r.get("share_pct"), 100)} for r in arr(b.get("rows")) if isinstance(r, dict) and r.get("label")]}
        for b in arr(e.get("breakdowns")) if isinstance(b, dict) and b.get("title")]
    e["breakdowns"] = [b for b in e["breakdowns"] if b["rows"]]
    e["sourcing"] = [{**s, "material": txt(s["material"])} for s in arr(e.get("sourcing")) if isinstance(s, dict) and s.get("material")]
    e["labour"] = [{**l, "skill": txt(l["skill"]), "minutes_per_unit": pos(l.get("minutes_per_unit")), "rate_per_hour": pos(l.get("rate_per_hour")), "headcount": pos(l.get("headcount"))}
                   for l in arr(e.get("labour")) if isinstance(l, dict) and l.get("skill")]
    e["one_time_costs"] = [{**o, "item": txt(o["item"]), "qty": pos(o.get("qty")) or 1, "unit_cost": pos(o.get("unit_cost")),
                            "include_in_order": o.get("include_in_order") is not False and str(o.get("include_in_order")).lower() not in ("false", "no", "0")}
                           for o in arr(e.get("one_time_costs")) if isinstance(o, dict) and o.get("item")]
    e["per_unit_costs"] = {k: pos(v) for k, v in obj(e.get("per_unit_costs")).items()}
    p = obj(e.get("percentages"))
    e["percentages"] = {k: pos(p[k], 100) for k in ("overhead_pct", "contingency_pct", "margin_pct", "tax_pct") if k in p}
    mp = obj(e.get("market_price"))
    lo, li, hi = ordered(mp.get("low"), mp.get("likely"), mp.get("high"))
    e["market_price"] = {"low": lo, "likely": li, "high": hi, "note": txt(mp.get("note"))}
    for k in ("compliance", "assumptions"):
        e[k] = [txt(x) for x in arr(e.get(k)) if x]
    e["process_steps"] = [p for p in arr(e.get("process_steps")) if isinstance(p, dict) and p.get("step")]
    e["timeline"] = [t for t in arr(e.get("timeline")) if isinstance(t, dict) and t.get("phase")]
    e["risks"] = [r for r in arr(e.get("risks")) if isinstance(r, dict) and r.get("risk")]
    return e


def _slug(s) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", str(s).lower()))[:40] or "opt"


def clean_question(q: dict) -> dict | None:
    if not isinstance(q, dict) or not q.get("q"):
        return None
    options = []
    for o in arr(q.get("options")):
        if isinstance(o, dict):
            v, l = txt(o.get("value") or o.get("label")), txt(o.get("label") or o.get("value"))
            if v and l:
                options.append({**o, "value": v, "label": l, "note": txt(o.get("note"))})
        elif o not in (None, ""):
            options.append({"value": _slug(o), "label": txt(o), "note": ""})
    t = q.get("type") if q.get("type") in TYPES else ("single" if options else "text")
    if t in ("single", "multi") and not options:
        t = "text"
    d = q.get("default")
    if t == "number":
        d = None if d in (None, "") else num(d)
    if t == "single" and d is not None and not any(o["value"] == d for o in options):
        d = next((o["value"] for o in options if o["label"] == d), options[0]["value"] if options else None)
    if t == "multi":
        d = [x for x in (d if isinstance(d, list) else [d] if d else []) if any(o["value"] == x for o in options)]
    return {**q, "id": txt(q.get("id") or _slug(q["q"])), "q": txt(q["q"]), "why": txt(q.get("why")), "type": t, "options": options, "default": d,
            "unit": txt(q["unit"]) if q.get("unit") is not None else None}


def clean_map(raw: Any) -> dict:
    m = dict(obj(raw))
    stages = []
    for i, s in enumerate(x for x in arr(m.get("stages")) if isinstance(x, dict)):
        qs = [c for c in (clean_question(q) for q in arr(s.get("questions"))) if c]
        stages.append({**s, "id": txt(s.get("id") or f"s{i + 1}"), "title": txt(s.get("title") or f"Stage {i + 1}"), "intro": txt(s.get("intro")), "questions": qs})
    m["stages"] = stages
    m["domain"], m["product_title"], m["summary"] = txt(m.get("domain")), txt(m.get("product_title")), txt(m.get("summary"))
    m["key_considerations"] = [txt(x) for x in arr(m.get("key_considerations")) if x]
    return m
