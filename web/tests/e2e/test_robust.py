"""Bug sweep 2026-11-19: messy AI output must never crash a screen (FR-002-17, FR-002-08)."""
import os
import json
import pathlib

import pytest

pw = pytest.importorskip("playwright.sync_api")
DIST = pathlib.Path(__file__).resolve().parents[2] / "dist" / "index.html"
pytestmark = pytest.mark.skipif(not DIST.exists(), reason="build the web app first (npm run build)")

UNDERSTAND = {"intent": "make", "summary": "Make T-shirts."}  # non-standard intent word on purpose
MAP = {"domain": "Apparel", "product_title": "T-shirts", "summary": "s",
       "raw_materials": [{"material": "Cotton yarn", "grades": "30s", "india_sources": "Tiruppur", "imported": "no"}, {"used_for": "nameless"}],
       "stages": [
           {"title": "Fabric", "questions": [
               {"id": "fab", "q": "Which fabric?", "type": "single", "options": ["Combed cotton", "Polyester"], "default": "Polyester"},
               {"id": "gsm", "q": "GSM?", "type": "number", "default": "180"},
               {"id": "odd", "q": "Odd type?", "type": "slider"},
               {"q": ""}]},
           {"title": "Empty stage"}, None]}
EST = {"product_title": 7, "summary": None,
       "options_catalog": [{"category": "Fabric"}, {"category": "Print", "options": ["x", {"name": "Screen"}]}],
       "breakdowns": [{"title": "Sizes"}, {"title": "Colours", "rows": [{"label": "Black", "share_pct": "60"}, {"label": "White", "share_pct": 140}]}],
       "bom": [{"component": "Fabric", "consumption_per_unit": "0.25", "wastage_pct": 150, "rate_low": 400, "rate_likely": 300, "rate_high": 200},
               {"material": "Thread", "rate_likely": "1,200"}, {"note": "no name"}, "junk"],
       "sourcing": [{"material": "Yarn"}, {"region": "x"}], "labour": {"skill": "not a list"},
       "one_time_costs": [{"item": "Screens", "qty": "2", "unit_cost": "1,500", "include_in_order": "yes"}],
       "per_unit_costs": {"packaging": "5", "logistics": -3}, "percentages": {"overhead_pct": 250, "tax_pct": "18"},
       "market_price": {"likely": 300}, "process_steps": "cut, sew", "compliance": ["BIS", {"code": "x"}, None],
       "timeline": [{"phase": "Sampling"}], "risks": [{"risk": "Delay"}, {"mitigation": "orphan"}]}

MOCK = """
window.claude = { use: async (n) => n !== 'sample' ? null : (async (input, o) => {
  const p = typeof input === 'string' ? input : input.map(m => m.content).join('\\n');
  const t = p.includes('UNDERSTAND THE REQUEST') ? %s : p.includes('TASK: Produce') ? %s : %s;
  o && o.onText && o.onText({ text: t });
  return { text: t, truncated: false };
}) };
""" % (json.dumps(json.dumps(UNDERSTAND)), json.dumps(json.dumps(EST)), json.dumps(json.dumps(MAP)))


# FR-002-17 FR-002-08
def test_messy_ai_output_never_crashes_any_screen():
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        pg = b.new_page(viewport={"width": 1366, "height": 900})
        errors = []
        pg.on("pageerror", lambda x: errors.append(str(x)))
        pg.add_init_script(MOCK)
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        pg.fill("#ue-ask", "t shirts for my brand")
        pg.press("#ue-ask", "Enter")
        pg.wait_for_selector("text=Which fabric?")  # intent "make" opens the interview directly (FR-012-13)
        assert pg.locator(".option:has-text('Combed cotton')").count() == 1  # plain-word options became buttons
        assert pg.locator("#raw-materials .rm-tile").count() == 1
        pg.click("text=Generate estimate now")
        pg.wait_for_selector(".tabs", timeout=10000)
        tabs = pg.locator(".tabs button")
        for i in range(tabs.count()):
            tabs.nth(i).click()
            pg.wait_for_timeout(150)
            body = pg.locator("main").inner_text()
            assert "NaN" not in body and "Infinity" not in body, tabs.nth(i).inner_text()
        pg.reload()  # the saved (messy) project must also load
        pg.wait_for_timeout(500)
        b.close()
        assert not errors, errors
