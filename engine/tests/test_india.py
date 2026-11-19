"""Spec 013 — India only (Python mirror)."""
import json
from pathlib import Path

from ultimatum import prompts
from ultimatum.agents.research import normalise_map
from ultimatum.schemas import ProjectRequest

PACKS = Path(__file__).resolve().parents[1] / "ultimatum" / "domain_packs.json"


# FR-013-01 FR-013-02 FR-013-05
def test_no_currency_question_and_indian_location():
    from ultimatum.schemas import KnowledgeMap
    m = normalise_map(KnowledgeMap.model_validate({"domain": "x", "product_title": "x", "summary": "", "stages": [
        {"id": "s1", "title": "Quantity & timeline", "questions": []}, {"id": "s2", "title": "Commercial", "questions": []}]}),
        ProjectRequest(product="T-shirts", qty=200, currency="USD"))
    qs = {q.id: q for s in m.stages for q in s.questions}
    assert "currency" not in qs
    assert qs["market_location"].q == "Which state or city in India?"
    assert qs["tax_pct"].q.startswith("GST rate")


# FR-013-01
def test_request_currency_forced_to_inr():
    assert ProjectRequest(product="shoes", currency="USD").currency == "INR"
    assert ProjectRequest(product="shoes", location="Coimbatore").location == "Coimbatore, India"


# FR-013-03
def test_prompts_india_only():
    r = ProjectRequest(product="T-shirts", qty=200)
    text = prompts.request_block(r) if hasattr(prompts, "request_block") else ""
    assert "India only" in prompts.INDIA and "GST" in prompts.INDIA
    assert "India only" in text


# FR-013-04
def test_packs_indian_regulation_only():
    text = PACKS.read_text()
    for w in ["FDA", "CE under", "EU MDR", "REACH", "OEKO", "Export compliance", "Export:"]:
        assert w not in text
