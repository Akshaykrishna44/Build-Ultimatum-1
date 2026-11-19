"""Browser tests for UI requirements. Run after `npm run build`:
    cd web && python -m pytest -q tests/e2e
Requires: pip install pytest playwright && playwright install chromium
"""
import os
import pathlib

import pytest

pw = pytest.importorskip("playwright.sync_api")
DIST = pathlib.Path(__file__).resolve().parents[2] / "dist" / "index.html"
pytestmark = pytest.mark.skipif(not DIST.exists(), reason="build the web app first (npm run build)")


@pytest.fixture
def page():
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        pg = b.new_page(viewport={"width": 1360, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        yield pg
        assert not errors, errors
        b.close()


# FR-001-01 FR-011-01
def test_start_page_is_one_text_box(page):
    controls = page.locator("main input, main textarea, main select")
    assert controls.count() == 1
    assert page.locator("main button[aria-label=Start]").count() == 1
    assert page.locator("text=What do you want to manufacture, build, grow or sell?").is_visible()
    assert page.locator("main [data-orb-state]").count() == 1
    assert page.locator(".ue-start .chip, .ue-start .try").count() == 0  # no example chips (the chat drawer has its own)
    assert page.locator(".mode-badge").count() == 0  # no "● Claude" badge in the header (AK, 2026-11-18)
    assert page.locator("text=Ask the expert").count() == 0  # not on home


# FR-011-02 FR-011-03 FR-011-05
def test_orb_listens_and_blank_submit_is_rejected(page):
    orb = page.locator("main [data-orb-state]")
    assert orb.get_attribute("data-orb-state") == "resting"
    page.fill("#ue-ask", "500 ICU ventilators")
    assert orb.get_attribute("data-orb-state") == "listening"
    page.fill("#ue-ask", "   ")
    assert orb.get_attribute("data-orb-state") == "resting"
    page.click("button[aria-label=Start]")
    assert page.locator("#ue-ask-error").inner_text() == "Enter what you have in mind first."
    assert page.locator(".working").count() == 0
    assert orb.get_attribute("data-orb-state") == "resting"


# FR-001-04 FR-011-06 FR-011-07
def test_ambiguous_request_offers_building_or_product(page):
    page.fill("#ue-ask", "garment factory in Tiruppur")
    page.press("#ue-ask", "Enter")
    assert page.locator(".ue-option:has-text('Build the factory')").is_visible()
    assert page.locator(".ue-option:has-text('Make the product')").is_visible()
    assert page.locator("main [data-orb-state]").get_attribute("data-orb-state") == "asking"
    page.click(".ue-option:has-text('Build the factory')")
    page.wait_for_selector("text=What type of project is it?")


# FR-011-08
def test_now_asking_rail_names_the_engine(page):
    page.fill("#ue-ask", "PEB warehouse 80 × 40 m")
    page.press("#ue-ask", "Enter")
    page.click(".ue-path:has-text('Open the building engine')")
    page.wait_for_selector("text=What type of project is it?")
    assert page.locator(".ue-rail-kicker").inner_text() == "Now asking"
    assert "building" in page.locator(".ue-rail-label").inner_text().lower()
    assert page.locator(".ue-rail [data-orb-state=asking]").count() == 1


# FR-001-05 FR-003-15
def test_building_prefill_and_live_estimate(page):
    page.fill("#ue-ask", "PEB warehouse 80 × 40 m")
    page.press("#ue-ask", "Enter")
    page.click(".ue-path:has-text('Open the building engine')")
    page.wait_for_selector("text=What type of project is it?")
    before = page.inner_text(".live-total")
    page.click(".stage-nav li >> nth=1")
    assert page.input_value(".num-input input >> nth=0") == "80"
    page.fill(".num-input input >> nth=0", "120")
    page.wait_for_timeout(100)
    assert page.inner_text(".live-total") != before


# FR-002-16
def test_estimate_step_always_reachable():
    """The '2 · Estimate' header step is clickable before any estimate exists and generates one."""
    import json as _json
    m = {"domain": "Footwear", "product_title": "Leather shoes", "summary": "s", "key_considerations": [],
         "stages": [{"id": "s1", "title": "Quantity & timeline", "intro": "", "questions": [
             {"id": "q1", "q": "Which type?", "why": "", "type": "single", "options": [{"value": "a", "label": "Oxford", "note": ""}], "default": "a"}]}]}
    e = {"product_title": "Leather shoes", "summary": "s", "bom": [{"assembly": "Upper", "component": "Upper", "material": "Leather", "category": "raw_material",
         "make_or_buy": "buy", "consumption_per_unit": 2, "unit": "sq ft", "wastage_pct": 12, "wastage_reason": "cutting", "rate_low": 90, "rate_likely": 110, "rate_high": 140}],
         "labour": [], "one_time_costs": [], "per_unit_costs": {}, "percentages": {"overhead_pct": 10, "contingency_pct": 5, "margin_pct": 15, "tax_pct": 12}}
    mock = ("window.claude={use:async(n)=>n==='sample'?(async(i,o)=>{const p=typeof i==='string'?i:i.map(x=>x.content).join(' ');"
            "const t=p.includes('UNDERSTAND THE REQUEST')?%s:p.includes('TASK: Produce')||p.includes('CLIENT ANSWERS FROM THE INTERVIEW')?%s:%s;o&&o.onText&&o.onText({text:t});return {text:t,truncated:false}}):null};"
            % (_json.dumps(_json.dumps({"intent": "make_manufacture", "summary": "Make leather shoes.", "paths": ["make"]})), _json.dumps(_json.dumps(e)), _json.dumps(_json.dumps(m))))
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        pg = b.new_page(viewport={"width": 1360, "height": 900})
        errors = []
        pg.on("pageerror", lambda x: errors.append(str(x)))
        pg.add_init_script(mock)
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        pg.fill("#ue-ask", "50,000 pairs of leather shoes")
        pg.press("#ue-ask", "Enter")
        pg.wait_for_selector("text=Which type?")
        step = pg.locator(".crumbs span:has-text('Estimate')")
        assert "off" not in (step.get_attribute("class") or "")
        step.click()
        pg.wait_for_selector("text=Grand total (likely)", timeout=10000)
        b.close()
        assert not errors, errors


# NFR (spec 001 §7): text stays readable when the host forces dark mode (bug reported by AK 2026-11-17)
def test_readable_when_host_forces_dark_mode():
    def lum(rgb):
        import re as _re
        r, g, b = [int(x) / 255 for x in _re.findall(r"\d+", rgb)[:3]]
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 900}, color_scheme="dark")
        pg = ctx.new_page()
        pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=':root{color-scheme:dark}';document.head.appendChild(s)})")
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        pg.fill("#ue-ask", "PEB warehouse 80 × 40 m")
        pg.press("#ue-ask", "Enter")
        pg.click(".ue-path:has-text('Open the building engine')")
        pg.wait_for_selector("text=What type of project is it?")
        pairs = pg.evaluate("""() => [...document.querySelectorAll('.option, .num-input input, .chip, .btn, input, textarea, select')]
            .map(e => { let bg = getComputedStyle(e).backgroundColor, n = e;
                        while (bg === 'rgba(0, 0, 0, 0)' && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor }
                        return [e.className || e.tagName, getComputedStyle(e).color, bg] })""")
        b.close()
    bad = []
    for name, fg, bg in pairs:
        l1, l2 = sorted([lum(fg), lum(bg)], reverse=True)
        if (l1 + 0.05) / (l2 + 0.05) < 3:
            bad.append((name, fg, bg))
    assert not bad, bad


# FR-001-08 FR-011-09
def test_end_task_returns_home_keeps_work_and_cancels_ai():
    import json as _json
    m = {"domain": "Footwear", "product_title": "Leather shoes", "summary": "s", "key_considerations": [],
         "stages": [{"id": "s1", "title": "Quantity & timeline", "intro": "", "questions": [
             {"id": "q1", "q": "Which type?", "why": "", "type": "single", "options": [{"value": "a", "label": "Oxford", "note": ""}], "default": "a"}]}]}
    U = {"intent": "make_manufacture", "summary": "Make leather shoes.", "questions": [], "paths": ["make", "buy"]}
    # every AI call takes 1.5 s, so we can end the task while it is running
    mock = ("window.claude={use:async(n)=>n==='sample'?(async(i,o)=>{await new Promise(r=>setTimeout(r,1500));const t=i.includes('UNDERSTAND THE REQUEST')?%s:%s;"
            "o&&o.onText&&o.onText({text:t});return {text:t,truncated:false}}):null};" % (_json.dumps(_json.dumps(U)), _json.dumps(_json.dumps(m))))
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        pg = b.new_page(viewport={"width": 1360, "height": 900})
        errors = []
        pg.on("pageerror", lambda x: errors.append(str(x)))
        pg.add_init_script(mock)
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        assert pg.locator("text=End task").count() == 0  # not on home
        # 1) end while the AI is working → stays home even after the AI finishes
        pg.fill("#ue-ask", "50,000 pairs of leather shoes")
        pg.press("#ue-ask", "Enter")
        pg.wait_for_selector(".working")
        pg.click("text=End task")
        pg.wait_for_selector("#ue-ask")
        pg.wait_for_timeout(2000)
        assert pg.locator("#ue-ask").is_visible() and pg.locator("text=Which type?").count() == 0
        # 2) end from the interview → home, then resume brings the work back
        pg.fill("#ue-ask", "50,000 pairs of leather shoes")
        pg.press("#ue-ask", "Enter")
        pg.wait_for_selector("text=Which type?", timeout=8000)
        pg.click("text=End task")
        pg.wait_for_selector("#ue-ask")
        pg.click("text=Resume last project")
        pg.wait_for_selector("text=Which type?")
        # 3) end from the building engine → home
        pg.click("text=End task")
        pg.fill("#ue-ask", "PEB warehouse 80 × 40 m")
        pg.press("#ue-ask", "Enter")
        pg.click(".ue-path:has-text('Open the building engine')")
        pg.wait_for_selector("text=What type of project is it?")
        pg.click("text=End task")
        pg.wait_for_selector("#ue-ask")
        b.close()
        assert not errors, errors


# NFR (spec 001 §7): desktop layout is aligned (AK 2026-11-18: "unproper on desktop")
@pytest.mark.parametrize("w,h", [(1920, 1080), (1536, 864), (1366, 768), (1280, 800)])
def test_desktop_alignment(w, h):
    with pw.sync_playwright() as p:
        b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(DIST.as_uri())
        pg.evaluate("localStorage.clear()")
        pg.reload()
        box = pg.locator(".ue-ask").bounding_box()
        assert box["width"] >= 600, "home text box collapsed"
        assert abs((box["x"] + box["width"] / 2) - w / 2) < 20, "home text box not centred"
        brand = pg.locator(".brand").bounding_box()
        main_left = pg.evaluate("() => { const m = document.querySelector('main'); const cs = getComputedStyle(m); return m.getBoundingClientRect().left + parseFloat(cs.paddingLeft) }")
        assert abs(brand["x"] - main_left) < 4, "header not aligned with content"
        pg.fill("#ue-ask", "PEB warehouse 80 × 40 m")
        pg.press("#ue-ask", "Enter")
        pg.click(".ue-path:has-text('Open the building engine')")
        pg.wait_for_selector("text=What type of project is it?")
        nav = pg.locator(".stage-nav").bounding_box()
        assert nav["width"] <= 300, "building side panel stretched across the page"
        assert pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"), "horizontal scroll"
        b.close()
