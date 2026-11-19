"""Spec 014 — raw materials first (Python mirror)."""
from ultimatum.agents.research import normalise_materials
from ultimatum import prompts
from ultimatum.schemas import ProjectRequest
from tests.test_engine import client  # noqa: F401  (shared fixture)


# FR-014-01
def test_research_prompt_asks_for_raw_materials():
    p = prompts.research(ProjectRequest(product="leather shoes"), web=False)
    assert '"raw_materials"' in p and "india_sources" in p


# FR-014-02
def test_normalise_materials():
    rows = normalise_materials([{"material": "Cow leather", "grades": "Full grain", "imported": "no", "origin": "Italy"},
                                {"used_for": "x"}, {"material": "Adhesive", "imported": "yes", "origin": "Germany"}]
                               + [{"material": f"m{i}"} for i in range(20)])
    assert len(rows) == 14
    assert rows[0] == {"material": "Cow leather", "used_for": "", "grades": ["Full grain"], "india_sources": [], "typical_price": "", "imported": False, "origin": ""}
    assert rows[1]["imported"] and rows[1]["origin"] == "Germany"


# FR-014-01 FR-014-03: the API returns them with the project map
def test_api_project_has_raw_materials(client):
    p = client.post("/v1/projects", json={"request": {"product": "leather shoes"}}).json()
    assert p["map"]["raw_materials"][0]["material"] == "Finished cow leather"
