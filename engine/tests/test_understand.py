"""Spec 012 — Python mirror of web/tests/understand.test.js."""
import os

os.environ["ULTIMATUM_LLM"] = "fake"

import pytest
from fastapi.testclient import TestClient

from ultimatum import api
from ultimatum.engine import UltimatumEngine
from ultimatum.llm import FakeLLM
from ultimatum.store import Store
from ultimatum.understand import is_meaningless, parse_sourcing, parse_understanding, sourcing_totals

MEANINGLESS = ["asdkj", "hmm", "xxxx", "qwerty", "zxcvb", "jkl", "a", "12", "   ", "!!!", "sdfg hjkl", "aaaaaaa", "qwer asdf"]
MEANINGFUL = ["need t shirts for an event", "500 ICU ventilators", "PEB warehouse 80 × 40 m", "which fabric is best for summer t-shirts?",
              "tea", "were can i buy rice", "rice", "शर्ट चाहिए", "சட்டை வேண்டும்", "gym", "solar plant 5 MW"]


# FR-012-02
@pytest.mark.parametrize("text", MEANINGLESS)
def test_rejects_meaningless(text):
    assert is_meaningless(text)["meaningless"]


# FR-012-02
@pytest.mark.parametrize("text", MEANINGFUL)
def test_accepts_requests(text):
    assert not is_meaningless(text)["meaningless"]


# FR-012-03
def test_parse_understanding_normalises():
    u = parse_understanding({"intent": "buy_source", "summary": "s", "questions": [{"q": "By when?"}, {"q": "a"}, {"q": "b"}, {"q": "c"}]})
    assert len(u["questions"]) == 3 and u["questions"][0]["id"] == "by_when"
    assert [p["id"] for p in u["paths"]] == ["buy", "make"]
    assert parse_understanding({"intent": "dance"})["intent"] == "unclear"


# FR-012-06
def test_sourcing_totals_in_code():
    plan = parse_sourcing({"options": [{"name": "x", "unit_price": {"low": 260, "likely": 200, "high": 150},
                                        "customisation_per_unit": {"likely": 30}, "delivery_total": {"likely": 500}, "total": 1}]})
    o = plan["options"][0]
    assert o["unit_price"] == {"low": 150, "likely": 200, "high": 260}
    assert sourcing_totals(o, 200)["likely"]["total"] == 200 * 200 + 30 * 200 + 500


# FR-012-01 FR-012-02 FR-012-06: API endpoints
def test_api_understand_and_sourcing(tmp_path):
    api._engine = UltimatumEngine(llm=FakeLLM(), store=Store(str(tmp_path / 't.db')), web=False)
    c = TestClient(api.app)
    assert c.post("/v1/understand", json={"text": "asdkj"}).json()["intent"] == "unclear"
    u = c.post("/v1/understand", json={"text": "need t shirts for an event"}).json()
    assert u["intent"] == "buy_source" and len(u["questions"]) >= 2
    p = c.post("/v1/sourcing", json={"text": "t shirts", "qty": 200}).json()
    assert p["options"][0]["totals"]["likely"]["total"] == 200 * 200 + 30 * 200 + 500
    assert "answer" in c.post("/v1/advise", json={"text": "t shirts"}).json()


# FR-012-11
@pytest.mark.parametrize("raw,want", [
    ({"intent": "manufacture", "summary": "Make mobile phones."}, "make_manufacture"),
    ({"intent": "Make_Manufacture"}, "make_manufacture"), ({"intent": "buy"}, "buy_source"),
    ({"intent": "construct"}, "build_construct"), ({"understanding": {"intent": "make_manufacture", "summary": "s"}}, "make_manufacture"),
    ({"intent": "odd", "summary": "A temple", "paths": ["build"]}, "build_construct"),
])
def test_robust_intent(raw, want):
    assert parse_understanding(raw)["intent"] == want


# FR-012-11
def test_unclear_overridden_for_real_requests():
    u = parse_understanding({"intent": "unclear"}, "mobile manufacturing")
    assert u["intent"] == "plan_project" and [p["id"] for p in u["paths"]] == ["buy", "make", "build", "advise"]
    assert parse_understanding({"intent": "unclear"}, "Ramesh Kumar")["intent"] == "unclear"


# FR-012-12
def test_building_type_and_construction_pack():
    from ultimatum.prompts import match_packs
    from ultimatum.schemas import ProjectRequest
    assert parse_understanding({"intent": "build_construct", "building_type": "other"})["building_type"] == "other"
    ids = [p["id"] for p in match_packs(ProjectRequest(product="i have planned to build a hindu temple"))]
    assert "construction" in ids
    assert "electronics" in [p["id"] for p in match_packs(ProjectRequest(product="mobile manufacturing"))]
