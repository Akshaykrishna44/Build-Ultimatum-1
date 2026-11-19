import os

os.environ["ULTIMATUM_LLM"] = "fake"

import pytest
from fastapi.testclient import TestClient

from ultimatum import api
from ultimatum.calc import calculate, gross_qty
from ultimatum.engine import UltimatumEngine
from ultimatum.llm import FakeLLM, extract_json
from ultimatum.schemas import BomRow, Estimate, Percentages
from ultimatum.store import Store, product_key


# FR-002-09
def test_gross_qty_wastage():
    row = BomRow(component="Upper", consumption_per_unit=2, wastage_pct=12)
    assert gross_qty(row, 50000) == pytest.approx(100000 / 0.88)


# FR-002-09  (same hand calc as web/tests/calc.test.js)
def test_calculate_chain():
    est = Estimate(bom=[BomRow(component="A", consumption_per_unit=1, wastage_pct=0, rate_low=10, rate_likely=10, rate_high=10)])
    t = calculate(est, 100, Percentages(overhead_pct=10, contingency_pct=0, margin_pct=0, tax_pct=0))
    assert t["likely"]["material"] == 1000
    assert t["likely"]["total"] == pytest.approx(1100)


# FR-002-03
def test_extract_json_tolerates_fences_and_trailing_commas():
    assert extract_json('```json\n{"a": [1, 2,],}\n```') == {"a": [1, 2]}


# FR-002-12
def test_product_key():
    assert product_key("Men's Leather Shoes") == product_key("leather shoes for men")


@pytest.fixture
def client(tmp_path):
    api._engine = UltimatumEngine(llm=FakeLLM(), store=Store(str(tmp_path / "t.db")), web=False)
    return TestClient(api.app)


# FR-002-05 FR-002-06 FR-002-10 FR-002-11 FR-002-15
def test_full_flow(client):
    r = client.post("/v1/projects", json={"request": {"product": "men's leather shoes", "qty": 50000, "unit": "pairs"}})
    assert r.status_code == 200, r.text
    p = r.json()
    pid = p["id"]
    assert p["answers"]["shoe_type"] == "oxford"           # expert defaults pre-filled
    assert p["progress"]["complete"] is True

    r = client.put(f"/v1/projects/{pid}/answers", json={"answers": {"construction": "goodyear"}})
    assert r.json()["answers"]["construction"] == "goodyear"

    r = client.post(f"/v1/projects/{pid}/stages/s1/followups")
    assert r.json()["new_questions"][0]["id"] == "welt_type"

    r = client.post(f"/v1/projects/{pid}/estimate")
    body = r.json()
    assert body["project"]["totals"]["likely"]["total"] > 0
    likely = body["project"]["totals"]["likely"]["total"]

    r = client.patch(f"/v1/projects/{pid}/estimate", json={"pct": {"margin_pct": 30}})
    assert r.json()["totals"]["likely"]["total"] > likely   # recalculated

    assert "Bill of materials" in client.get(f"/v1/projects/{pid}/export/md").text
    assert client.get(f"/v1/projects/{pid}/export/bom.csv").text.startswith("Component")
    assert client.post("/v1/chat", json={"project_id": pid, "messages": [{"role": "user", "content": "hi"}]}).json()["answer"]


# FR-002-12
def test_knowledge_reuse(client):
    p1 = client.post("/v1/projects", json={"request": {"product": "leather shoes", "qty": 10}}).json()
    assert p1["reused_knowledge"] is False
    client.post(f"/v1/knowledge/{p1['knowledge_id']}/verify", json={"by": "AK"})
    p2 = client.post("/v1/projects", json={"request": {"product": "Leather Shoes", "qty": 20}}).json()
    assert p2["reused_knowledge"] is True and p2["knowledge_id"] == p1["knowledge_id"]


# FR-002-03
def test_missing_commercial_questions_are_added():
    from ultimatum.agents.research import normalise_map
    from ultimatum.schemas import KnowledgeMap, ProjectRequest
    m = KnowledgeMap(domain="x", product_title="x", stages=[{"id": "s1", "title": "Basics", "questions": [{"id": "a", "q": "?", "type": "text"}]}])
    m = normalise_map(m, ProjectRequest(product="xx", qty=1))
    ids = {q.id for s in m.stages for q in s.questions}
    assert {"overhead_pct", "contingency_pct", "margin_pct", "tax_pct"} <= ids


# FR-002-01 FR-002-02 FR-002-13 FR-001-03
def test_domain_packs_shared_and_matching():
    import json, pathlib
    from ultimatum import prompts
    from ultimatum.schemas import ProjectRequest
    root = pathlib.Path(__file__).resolve().parents[2]
    a = json.loads((root / "engine/ultimatum/domain_packs.json").read_text())
    b = json.loads((root / "web/src/domainPacks.json").read_text())
    assert a == b, "web/src/domainPacks.json must be a copy of engine/ultimatum/domain_packs.json"
    ids = lambda p: [x["id"] for x in prompts.match_packs(ProjectRequest(product=p, qty=1))]
    assert ids("ICU ventilators for hospitals") == ["medical"]
    assert ids("api server") == []
    assert "Intended use & regulatory class" in prompts.stage_list(ProjectRequest(product="ventilator", qty=1))
    assert "CDSCO" in prompts.research(ProjectRequest(product="ventilators", qty=500), web=False)


# FR-001-02 FR-001-04 FR-001-05
def test_router(client):
    r = client.post("/v1/route", json={"product": "Medium-industry factory building 60 × 30 m with 10 t EOT crane", "qty": 1}).json()
    assert r["engine"] == "building" and r["prefill"]["industry_class"] == "medium" and r["prefill"]["crane"] == "10" and r["prefill"]["length"] == 60
    r = client.post("/v1/route", json={"product": "500 ICU ventilators", "qty": 500}).json()
    assert r["engine"] == "ai" and r["packs"] == ["medical"]
    r = client.post("/v1/route", json={"product": "garment factory", "qty": 1}).json()
    assert r["ambiguous"] is True


# FR-002-04
def test_quantity_from_interview(client):
    p = client.post("/v1/projects", json={"request": {"product": "leather shoes"}}).json()   # no qty stated
    assert p["request"]["qty"] == 0
    assert "order_qty" in [q["id"] for s in p["map"]["stages"] for q in s["questions"]]
    client.put(f"/v1/projects/{p['id']}/answers", json={"answers": {"order_qty": 1200}})
    r = client.post(f"/v1/projects/{p['id']}/estimate").json()
    assert r["project"]["request"]["qty"] == 1200


# FR-002-04
def test_location_asked_in_interview_india_only(client):
    p = client.post("/v1/projects", json={"request": {"product": "leather shoes"}}).json()
    ids = [q["id"] for s in p["map"]["stages"] for q in s["questions"]]
    assert {"market_location", "order_qty"} <= set(ids) and "currency" not in ids  # FR-013-01: India only, INR
    client.put(f"/v1/projects/{p['id']}/answers", json={"answers": {"market_location": "Agra", "currency": "USD", "order_qty": 10}})
    r = client.post(f"/v1/projects/{p['id']}/estimate").json()["project"]["request"]
    assert (r["location"], r["currency"], r["qty"]) == ("Agra, India", "INR", 10)


# FR-001-07
def test_router_parity_with_js():
    """The JS suite checks the same case file (web/tests/router.test.js)."""
    import json, pathlib
    from ultimatum.router import route
    from ultimatum.schemas import ProjectRequest
    cases = json.loads((pathlib.Path(__file__).resolve().parents[2] / "web/tests/fixtures/router_cases.json").read_text())
    for c in cases:
        r = route(ProjectRequest(product=c["product"]))
        got = {"engine": r["engine"], "ambiguous": r["ambiguous"], "packs": r["packs"], "prefill": r["prefill"]}
        exp = dict(c["expect"])
        exp["prefill"] = {k: (float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v) for k, v in exp["prefill"].items()}
        got["prefill"] = {k: (float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v) for k, v in got["prefill"].items()}
        assert got == exp, c["product"]


# FR-002-07 FR-002-08
def test_estimate_sanitised_and_multilevel_bom():
    from ultimatum.agents.estimator import sanitise
    from ultimatum.schemas import Estimate
    e = Estimate.model_validate({"bom": [
        {"component": "Housing", "assembly": "Enclosure", "category": "component", "make_or_buy": "make", "wastage_pct": 300,
         "wastage_reason": "runner regrind not allowed", "rate_low": 100, "rate_likely": 50, "rate_high": 80}],
        "breakdowns": [{"title": "Mix", "rows": [{"label": "A", "share_pct": 30}, {"label": "B", "share_pct": 30}]}]})
    e, warnings = sanitise(e)
    b = e.bom[0]
    assert b.wastage_pct == 60 and (b.rate_low, b.rate_likely, b.rate_high) == (50, 80, 100)
    assert b.assembly == "Enclosure" and b.category == "component" and b.make_or_buy == "make" and b.wastage_reason
    assert abs(sum(r.share_pct for r in e.breakdowns[0].rows) - 100) < 0.01
    assert len(warnings) == 3


# FR-002-07
def test_estimate_without_bom_rejected():
    from ultimatum.agents.estimator import EstimatorAgent
    from ultimatum.llm import BaseLLM, LLMResult, LLMError
    from ultimatum.schemas import KnowledgeMap, ProjectRequest

    class NoBom(BaseLLM):
        def complete(self, messages, **kw):
            return LLMResult('{"bom": []}')
    m = KnowledgeMap(domain="x", product_title="x", stages=[])
    with pytest.raises(LLMError):
        EstimatorAgent(NoBom(), web=False).run(ProjectRequest(product="xx", qty=1), m, {})
