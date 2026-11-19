"""Bug sweep: messy AI JSON must not fail a whole step (FR-002-17), Python mirror of web/tests/estimate.test.js."""
from ultimatum.clean import clean_estimate, clean_map
from ultimatum.schemas import Estimate, KnowledgeMap


# FR-002-17
def test_messy_estimate_validates_and_is_ordered():
    raw = {"bom": [{"component": "Fabric", "consumption_per_unit": "0.25", "wastage_pct": 150, "rate_low": 400, "rate_likely": "300", "rate_high": 200},
                   {"material": "Thread", "rate_likely": "1,200"}, {"note": "no name"}, "junk"],
           "labour": {"skill": "x"}, "per_unit_costs": {"packaging": "5", "logistics": -3},
           "options_catalog": [{"category": "Fabric"}], "breakdowns": [{"title": "Sizes"}],
           "percentages": {"overhead_pct": 250, "tax_pct": "18"}, "market_price": {"likely": 300}, "compliance": ["BIS", None]}
    from ultimatum.agents.estimator import sanitise
    est, warnings = sanitise(Estimate.model_validate(clean_estimate(raw)))
    assert [b.component for b in est.bom] == ["Fabric", "Thread"]
    assert (est.bom[0].rate_low, est.bom[0].rate_likely, est.bom[0].rate_high) == (200, 300, 400)
    assert est.bom[0].wastage_pct == 60 and est.bom[1].rate_likely == 1200
    assert len(warnings) == 2  # wastage clamped, rates re-ordered
    assert est.labour == [] and est.options_catalog == [] and est.breakdowns == []
    assert est.percentages.overhead_pct == 100 and est.percentages.tax_pct == 18
    assert est.per_unit_costs == {"packaging": 5, "logistics": 0}


# FR-002-17
def test_messy_map_validates():
    raw = {"domain": "Apparel", "product_title": "T-shirts", "stages": [
        {"title": "Fabric", "questions": [
            {"id": "fab", "q": "Which fabric?", "type": "single", "options": ["Combed cotton", "Polyester"], "default": "Polyester"},
            {"id": "gsm", "q": "GSM?", "type": "number", "default": "180"},
            {"id": "odd", "q": "Odd?", "type": "slider"}, {"q": ""}]},
        {"title": "Empty"}, None]}
    m = KnowledgeMap.model_validate(clean_map(raw))
    fab, gsm, odd = m.stages[0].questions
    assert [o.value for o in fab.options] == ["combed_cotton", "polyester"] and fab.default == "polyester"
    assert gsm.default == 180 and odd.type == "text"
    assert [s.id for s in m.stages] == ["s1", "s2"]


# Bug sweep: API size limits, chat shape, CSV formula escaping
def test_api_limits_and_chat_shape(tmp_path):
    from fastapi.testclient import TestClient
    from ultimatum import api
    from ultimatum.engine import UltimatumEngine
    from ultimatum.llm import FakeLLM
    from ultimatum.store import Store
    api._engine = UltimatumEngine(llm=FakeLLM(), store=Store(str(tmp_path / "t.db")), web=False)
    c = TestClient(api.app)
    assert c.post("/v1/projects", json={"request": {"product": "x" * 2001}}).status_code == 422
    assert c.post("/v1/understand", json={"text": "y" * 2001}).status_code == 422
    assert c.post("/v1/chat", json={"messages": [{"role": "system", "content": "hi"}]}).status_code == 422
    assert c.post("/v1/chat", json={"messages": [{"role": "user", "content": "z" * 6001}]}).status_code == 422
    assert c.post("/v1/chat", json={"messages": [{"role": "user", "content": "hi"}] * 41}).status_code == 422
    assert c.post("/v1/chat", json={"messages": [{"role": "user", "content": "best leather for shoes?"}]}).status_code == 200
    assert "auth" in c.get("/health").json()


def test_csv_formula_escaping():
    from ultimatum.exporter import safe
    assert safe("=HYPERLINK(\"x\")") == "'=HYPERLINK(\"x\")" and safe("+91 cmd") == "'+91 cmd" and safe("-x") == "'-x"
    assert safe(-5) == -5 and safe("Cotton") == "Cotton"


# Security: only http(s) source links are kept
def test_source_links_http_only():
    from ultimatum.schemas import Source
    assert Source(url="javascript:alert(1)").url == ""
    assert Source(url="data:text/html,x").url == ""
    assert Source(url="https://bis.gov.in").url == "https://bis.gov.in"


# Security: the token check works (constant-time compare)
def test_token_required_when_set(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from ultimatum import api
    from ultimatum.engine import UltimatumEngine
    from ultimatum.llm import FakeLLM
    from ultimatum.store import Store
    api._engine = UltimatumEngine(llm=FakeLLM(), store=Store(str(tmp_path / "t.db")), web=False)
    monkeypatch.setenv("ULTIMATUM_API_TOKEN", "s3cret")
    c = TestClient(api.app)
    assert c.post("/v1/understand", json={"text": "need t shirts"}).status_code == 401
    assert c.post("/v1/understand", json={"text": "need t shirts"}, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert c.post("/v1/understand", json={"text": "need t shirts"}, headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert c.get("/health").json()["auth"] is True


# Load-test bug (2026-11-19): concurrent users shared one SQLite connection and got 500 errors / empty reads
def test_store_survives_concurrent_users(tmp_path):
    import threading
    from ultimatum.schemas import Project, ProjectRequest
    from ultimatum.store import Store
    st = Store(str(tmp_path / "c.db"))
    errors = []

    def worker(i):
        try:
            for j in range(15):
                p = Project(id=f"p{i}_{j}", created_at="t", updated_at="t", request=ProjectRequest(product=f"leather shoes {i}"))
                st.save_project(p)
                got = st.get_project(p.id)
                assert got and got.request.product == f"leather shoes {i}"
                st.list_projects(5)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{type(e).__name__}: {e}")

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(30)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert errors == []
    assert len(st.list_projects(1000)) == 450
