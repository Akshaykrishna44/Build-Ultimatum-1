"""All prompts in one place. Each starts with a 'TASK:' marker (used by FakeLLM routing and logs)."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .schemas import KnowledgeMap, ProjectRequest, Stage

from .india import INDIA  # noqa: E402,F401

PACKS = json.loads((Path(__file__).parent / "domain_packs.json").read_text(encoding="utf-8"))

STAGES = [
    "Classification & intended use", "Purpose & market", "Quantity & timeline", "Variants & specifications", "Components",
    "Raw materials & grades", "Losses & wastage", "Process & machinery", "Workforce",
    "Infrastructure & utilities", "Compliance & quality", "Sourcing & procurement",
    "Packaging & logistics", "Commercial terms", "Risk",
]

EXPERT = ("You are a senior domain engineer, industrial cost estimator and sourcing expert with deep knowledge of "
          "every industry (manufacturing, electronics, construction, agriculture, textiles, food, chemicals, services).")


def match_packs(r: ProjectRequest) -> list[dict]:
    """Domain packs whose keywords appear as whole words (plurals allowed) in the request."""
    text = f" {r.product} {r.notes} ".lower()
    return [p for p in PACKS["packs"]
            if any(re.search(r"(^|[^a-z])" + re.escape(k) + r"(s|es)?([^a-z]|$)", text) for k in p["keywords"])]


def domain_block(r: ProjectRequest) -> str:
    return "EXPERT GUIDANCE\n- " + PACKS["universal"] + "".join(f"\n- {p['label'].upper()}: {p['hints']}" for p in match_packs(r))


def stage_list(r: ProjectRequest) -> list[str]:
    extra = [s for p in match_packs(r) for s in p.get("stages", []) if s not in STAGES]
    return STAGES[:1] + extra + STAGES[1:]


def request_block(r: ProjectRequest) -> str:
    qty = f"{r.qty:g} {r.unit}" if r.qty > 0 else "not stated yet (ask it in the Quantity stage)"
    return (f"CLIENT REQUEST\n- What they want: {r.product}\n- Quantity: {qty}\n"
            f"- Location: {r.location}\n- Currency: INR (₹)\n- Extra notes: {r.notes or 'none'}\n{INDIA}")


def answers_block(m: KnowledgeMap, answers: dict[str, Any]) -> str:
    lines = []
    for st in m.stages:
        for q in st.questions:
            a = answers.get(q.id)
            labels = {o.value: o.label for o in q.options}
            if isinstance(a, list):
                a = ", ".join(labels.get(v, str(v)) for v in a)
            elif q.options:
                a = labels.get(a, a)
            other = answers.get(q.id + "__other")
            if other:
                a = f"{a + '; ' if a else ''}Other: {other}"
            if a in (None, ""):
                a = "not answered (use expert default)"
            lines.append(f"[{st.title}] {q.q} → {a}{' ' + q.unit if q.unit else ''}")
    return "\n".join(lines)


QUESTION_SHAPE = ('{"id":"q_short_snake","q":"question","why":"why it matters","type":"single|multi|number|text",'
                  '"options":[{"value":"v","label":"Label","note":"expert note"}],"unit":"for number","default":"..."}')


def research(r: ProjectRequest, web: bool) -> str:
    research_line = ("First use web search to research how this product is made today, typical material consumption, "
                     "wastage, standards and current market prices in the client's location. Then " if web else "")
    return f"""TASK: RESEARCH
{EXPERT}

{request_block(r)}

{domain_block(r)}

{research_line}Design the requirement-gathering INTERVIEW you would run with this client, from the basics to every
detail needed for a complete estimate (classification and regulation, numbers and volumes, assemblies, raw materials,
types, grades, wastage, process, labour, packaging, overheads, contingency, margin, sourcing, compliance, risk).

Stages in this order (skip only if truly irrelevant): {' | '.join(stage_list(r))}.
The first stage classifies the product (category, sub-type, regulatory/risk class, variant).
2–3 sharp, domain-specific questions per stage (about 30–40 total).
- Prefer "single"/"multi" with 3–7 realistic options, each with a short expert note (price/quality/use implication).
- "number" for numeric inputs (with unit and industry-typical default); "text" only when unavoidable.
- "default" = industry-typical choice (single: one value; multi: array; number: number).
- The Quantity stage MUST include a number question with id "order_qty" whose unit is the counting unit (units, pairs,
  pieces, acres, kg, litres…) and whose default is the client's stated quantity, or a typical order size if none was stated.
- Commercial stage MUST include number questions with ids overhead_pct, contingency_pct, margin_pct, tax_pct.
- raw_materials: 6–12 rows, the main raw materials and key bought components, shown to the client BEFORE the interview.
  India first; imported true only when nothing suitable is found in India (then give origin).

Return ONLY JSON:
{{"domain":"","product_title":"","summary":"2-3 sentences","key_considerations":["5-7 points"],
 "raw_materials":[{{"material":"","used_for":"","grades":["2-4"],"india_sources":["2-3 places / clusters / supplier types in India"],"typical_price":"₹ range with unit","imported":false,"origin":""}}],
 "stages":[{{"id":"s1","title":"","intro":"","questions":[{QUESTION_SHAPE}]}}]}}"""


def followups(r: ProjectRequest, m: KnowledgeMap, answers: dict[str, Any], stage: Stage) -> str:
    existing = [q.id for s in m.stages for q in s.questions]
    return f"""TASK: FOLLOWUPS
{EXPERT}

{request_block(r)}
PRODUCT: {m.product_title} (domain: {m.domain})

ANSWERS SO FAR:
{answers_block(m, answers)}

The client just finished the stage "{stage.title}". As an expert, what DEEPER questions do their specific answers raise
that the interview has not asked yet? (Example: choosing Goodyear welt construction raises welt-strip and cork-filler
questions.) Return 0–3 questions; return an empty list if nothing important is missing. Do not reuse these ids: {existing}

Return ONLY JSON: {{"questions":[{QUESTION_SHAPE}]}}"""


def estimate(r: ProjectRequest, m: KnowledgeMap, answers: dict[str, Any], web: bool) -> str:
    unit1 = r.unit[:-1] if r.unit.endswith("s") else r.unit
    research_line = ("Use web search to check current prices and suppliers for the key materials in the client's "
                     "market before answering. " if web else "")
    return f"""TASK: ESTIMATE
{EXPERT}

{request_block(r)}
PRODUCT: {m.product_title} (domain: {m.domain})

CLIENT ANSWERS FROM THE INTERVIEW
{answers_block(m, answers)}

{domain_block(r)}

{research_line}Produce the complete estimate data for the client's chosen configuration, from raw materials to finished
delivery, with realistic current market rates for {r.location or 'the client market'} in INR.
Give UNIT-LEVEL figures only. A calculation engine does all totals.

Rules:
- bom: 12–30 rows, a MULTI-LEVEL bill covering EVERY assembly, component, raw material, consumable and PACKAGING item.
  Each row: assembly (module it belongs to), category (raw_material|component|sub_assembly|consumable|packaging),
  make_or_buy (make|buy), consumption_per_unit = amount for ONE {unit1} before wastage, wastage_pct = realistic loss,
  wastage_reason = the process cause (SMT attrition, runner regrind, final-test rejection, cutting/nesting...).
  rate_low/likely/high = INR per consumption unit (low = budget source, high = premium).
- options_catalog: 4–8 categories × 3–6 options, so the client sees EVERY available choice.
- breakdowns: quantity mix tables where relevant (size mix, model mix, area split); share_pct sums to 100 per table.
- sourcing: 6–12 rows: where to buy (city / cluster / state in India), source type, price range, quality grade A/B/C, lead time, MOQ.
- labour: every skill/trade with minutes_per_unit (per ONE {unit1}), rate_per_hour, headcount for the timeline.
- one_time_costs: R&D/design, tooling, moulds, dies, fixtures, test jigs, certification/regulatory, testing/validation, setup,
  machinery, each with category (rnd|tooling|certification|setup|machinery); include_in_order only if charged to this order.
- per_unit_costs: packaging, logistics, utilities per ONE {unit1}.
- percentages: use the client's overhead/contingency/margin/tax answers if given.
- market_price: typical selling price per unit in this market.

Return ONLY JSON:
{{"product_title":"","summary":"","unit_label":"{r.unit}","price_basis":"basis with month/year",
"options_catalog":[{{"category":"","options":[{{"name":"","description":"","cost_impact":"","quality":"","best_for":""}}]}}],
"breakdowns":[{{"title":"","rows":[{{"label":"","share_pct":0}}]}}],
"bom":[{{"assembly":"","component":"","material":"","grade":"","category":"component","make_or_buy":"buy","consumption_per_unit":0,"unit":"","wastage_pct":0,"wastage_reason":"","rate_low":0,"rate_likely":0,"rate_high":0,"note":""}}],
"sourcing":[{{"material":"","region":"","source_type":"","price_range":"","quality_grade":"A","lead_time":"","moq":"","notes":""}}],
"labour":[{{"skill":"","minutes_per_unit":0,"rate_per_hour":0,"headcount":0}}],
"one_time_costs":[{{"item":"","category":"tooling","qty":1,"unit_cost":0,"include_in_order":true,"note":""}}],
"per_unit_costs":{{"packaging":0,"logistics":0,"utilities":0}},
"percentages":{{"overhead_pct":0,"contingency_pct":0,"margin_pct":0,"tax_pct":0}},
"market_price":{{"low":0,"likely":0,"high":0,"note":""}},
"process_steps":[{{"step":"","description":"","machine":""}}],"compliance":[""],
"timeline":[{{"phase":"","duration":""}}],"assumptions":[""],"risks":[{{"risk":"","mitigation":""}}]}}"""


def expert_context(r: ProjectRequest | None, m: KnowledgeMap | None, answers: dict | None, totals: str = "") -> str:
    parts = [EXPERT, INDIA, "Answer the client practically and specifically (numbers, grades, places, supplier types, standards). "
             "Be concise. Say when a figure is an estimate that should be verified with quotes."]
    if r:
        parts.append(request_block(r))
    if m:
        parts.append(f"PRODUCT: {m.product_title} (domain: {m.domain})\nSUMMARY: {m.summary}")
        if answers:
            parts.append("CLIENT ANSWERS:\n" + answers_block(m, answers))
    if totals:
        parts.append("CURRENT ESTIMATE:\n" + totals)
    return "\n\n".join(parts)


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
