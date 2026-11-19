"""Spec 012 — understand the request first. Browser tests with a scripted AI.
Every AI call is recorded in window.__calls (prompt + tier), so tests can prove that no AI call
or no long process started.
"""
import os
import json
import pathlib

import pytest

pw = pytest.importorskip("playwright.sync_api")
DIST = pathlib.Path(__file__).resolve().parents[2] / "dist" / "index.html"
pytestmark = pytest.mark.skipif(not DIST.exists(), reason="build the web app first (npm run build)")

TSHIRT = {
    "intent": "buy_source",
    "summary": "You need custom T-shirts for an event.",
    "questions": [
        {"id": "qty", "q": "How many T-shirts do you need?", "options": ["50", "100", "200", "500"]},
        {"id": "date", "q": "When is the event?", "options": ["Within 1 week", "2–3 weeks", "A month or more"]},
        {"id": "print", "q": "Plain or printed?", "options": ["Plain", "Printed logo", "Full custom design"]},
    ],
    "paths": ["buy", "make", "advise"],
}
QUESTION = {
    "intent": "question",
    "summary": "Which fabric suits summer T-shirts.",
    "answer": "Combed cotton, 160–180 GSM, single jersey is best for summer.",
    "paths": [{"id": "buy", "label": "Turn this into a sourcing plan"}],
}
TEMPLE = {"intent": "build_construct", "building_type": "other", "summary": "You plan to build a Hindu temple.",
          "questions": [{"id": "style", "q": "Which temple style?", "options": ["Dravidian", "Nagara", "Vesara"]}], "paths": ["build", "advise"]}
MOBILE = {"intent": "manufacture", "summary": "You want to manufacture mobile phones."}
UNCLEAR = {"intent": "unclear", "summary": "", "reason": "That looks like a name, not a request."}
SOURCING = {
    "currency": "INR",
    "options": [
        {"name": "Custom-printed T-shirts", "what": "Cotton tees with your logo", "unit_price": {"low": 150, "likely": 200, "high": 260},
         "customisation_per_unit": {"low": 20, "likely": 30, "high": 45}, "delivery_total": {"low": 0, "likely": 500, "high": 1000},
         "moq": "50", "lead_time": "7–10 days", "where": ["Tiruppur printers", "IndiaMART"], "total": 1},
    ],
    "tips": ["Order 5% extra for size mismatches."],
}
MAP = {"domain": "Apparel", "product_title": "T-shirts", "summary": "s", "key_considerations": [],
       "raw_materials": [
           {"material": "Combed cotton yarn", "used_for": "Knitted fabric", "grades": ["30s single jersey", "Organic"], "india_sources": ["Tiruppur", "Coimbatore spinning mills"], "typical_price": "₹260–320 per kg", "imported": False},
           {"material": "Plastisol ink", "used_for": "Screen printing", "grades": ["Standard"], "india_sources": ["Mumbai ink makers"], "typical_price": "₹600–900 per kg", "imported": False},
           {"material": "Specialty puff additive", "used_for": "3D print effect", "grades": ["Puff base"], "india_sources": ["Importers in Mumbai"], "typical_price": "₹2,000 per kg", "imported": True, "origin": "Japan"}],
       "stages": [{"id": "s1", "title": "Quantity & timeline", "intro": "", "questions": [
           {"id": "q1", "q": "Which fabric?", "why": "", "type": "single", "options": [{"value": "a", "label": "Cotton", "note": ""}], "default": "a"}]}]}

MOCK = """
window.__calls = [];
window.claude = { use: async (n) => n !== 'sample' ? null : (async (input, o) => {
  const p = typeof input === 'string' ? input : input.map(m => m.content).join('\\n');
  window.__calls.push({ p, tier: o && o.modelTier });
  await new Promise(r => setTimeout(r, window.__delay || 300));
  let t;
  if (p.includes('UNDERSTAND THE REQUEST')) {
    const w = (p.match(/USER WROTE: \\x22{3}([^\\x22]*)\\x22{3}/) || [0, p])[1];
    t = /fabric/i.test(w) ? %(q)s : /ramesh|cricket bats/i.test(w) ? %(u)s : /temple/i.test(w) ? %(tm)s : /mobile/i.test(w) ? %(mo)s : %(t)s;
  } else if (p.includes('SOURCING PLAN')) t = %(s)s;
  else if (p.includes('ADVISE THE CLIENT')) t = 'Get them screen-printed locally; it is cheapest above 100 pieces.';
  else t = %(m)s;
  o && o.onText && o.onText({ text: t });
  return { text: t, truncated: false };
}) };
""" % {k: json.dumps(json.dumps(v)) for k, v in {"q": QUESTION, "u": UNCLEAR, "t": TSHIRT, "s": SOURCING, "m": MAP, "tm": TEMPLE, "mo": MOBILE}.items()}


def open_app(p, mock=True):
    b = getattr(p, os.environ.get("E2E_BROWSER", "chromium")).launch()
    pg = b.new_page(viewport={"width": 1360, "height": 900})
    errors = []
    pg.on("pageerror", lambda x: errors.append(str(x)))
    if mock:
        pg.add_init_script(MOCK)
    pg.goto(DIST.as_uri())
    pg.evaluate("localStorage.clear()")
    pg.reload()
    return b, pg, errors


@pytest.fixture
def app():
    with pw.sync_playwright() as p:
        b, pg, errors = open_app(p)
        yield pg
        assert not errors, errors
        b.close()


def ask(pg, text):
    pg.fill("#ue-ask", text)
    pg.press("#ue-ask", "Enter")


def calls(pg):
    return pg.evaluate("window.__calls.length")


def orb(pg):
    return pg.locator(".ue-start [data-orb-state]").get_attribute("data-orb-state")


# FR-012-02 AC-1
@pytest.mark.parametrize("text", ["asdkj", "hmm", "xxxx", "qwerty"])
def test_meaningless_input_is_rejected_without_ai(app, text):
    ask(app, text)
    app.wait_for_selector("text=I didn't understand that")
    assert app.locator(".ue-turn .ue-example").count() == 3
    assert calls(app) == 0
    assert app.locator(".working").count() == 0
    assert orb(app) == "resting"
    app.click(".ue-example >> nth=0")  # an example fills the box
    assert len(app.input_value("#ue-ask")) > 5


# FR-012-03: the AI can also say it did not understand
def test_ai_unclear_reply_starts_nothing(app):
    ask(app, "Ramesh Kumar")
    app.wait_for_selector("text=I didn't understand that")
    assert app.locator("text=That looks like a name").is_visible()
    assert calls(app) == 1 and app.locator(".working").count() == 0


# FR-012-01 FR-012-03 FR-012-04 FR-012-09 AC-2
def test_understanding_turn_before_any_research(app):
    app.evaluate("window.__delay = 1200")
    ask(app, "need t shirts for an event")
    app.wait_for_timeout(300)
    assert orb(app) == "thinking"
    app.wait_for_selector("text=Here's what I understood")
    assert app.locator("text=You need custom T-shirts for an event.").is_visible()
    assert app.locator(".ue-q").count() >= 2
    for label in ["Buy / source it", "Manufacture it", "Just advise me"]:
        assert app.locator(f".ue-path:has-text('{label}')").is_visible()
    assert orb(app) == "asking"
    assert calls(app) == 1
    c = app.evaluate("window.__calls[0]")
    assert c["tier"] == "quick" and "need t shirts for an event" in c["p"]
    assert app.locator(".working").count() == 0  # no research started


# FR-012-05 AC-3
def test_question_gets_a_direct_answer(app):
    ask(app, "which fabric is best for summer t-shirts?")
    app.wait_for_selector("text=Combed cotton, 160–180 GSM")
    assert app.locator(".ue-path:has-text('Turn this into a sourcing plan')").is_visible()
    assert app.locator(".working").count() == 0 and calls(app) == 1


# FR-012-06 AC-4
def test_buy_path_gives_sourcing_plan_with_code_totals(app):
    ask(app, "need t shirts for an event")
    app.wait_for_selector("text=Here's what I understood")
    app.click(".ue-q >> nth=0 >> .ue-opt:has-text('200')")
    app.click(".ue-path:has-text('Buy / source it')")
    app.wait_for_selector(".ue-sourcing")
    assert app.input_value(".ue-sourcing .ue-qty input") == "200"
    total = app.locator(".ue-sourcing [data-total-likely] >> nth=0").get_attribute("data-total-likely")
    assert float(total) == 200 * 200 + 30 * 200 + 500  # not the AI's "total": 1
    assert app.locator("text=Tiruppur printers").is_visible()
    app.fill(".ue-sourcing .ue-qty input", "100")
    total = app.locator(".ue-sourcing [data-total-likely] >> nth=0").get_attribute("data-total-likely")
    assert float(total) == 200 * 100 + 30 * 100 + 500
    p = app.evaluate("window.__calls[1].p")
    assert "SOURCING PLAN" in p and "200" in p


# FR-012-07: manufacture continues into the AI product engine with the answers
def test_manufacture_path_carries_answers_into_research(app):
    ask(app, "need t shirts for an event")
    app.wait_for_selector("text=Here's what I understood")
    app.click(".ue-q >> nth=0 >> .ue-opt:has-text('500')")
    app.fill(".ue-q >> nth=1 >> input", "on 5 December")
    app.click(".ue-path:has-text('Manufacture it')")
    app.wait_for_selector("text=Which fabric?", timeout=8000)
    p = app.evaluate("window.__calls[1].p")
    assert "How many T-shirts do you need? 500" in p and "on 5 December" in p


# FR-012-07 FR-012-08 AC-5
def test_building_request_gets_one_click_confirm_without_ai(app):
    ask(app, "PEB warehouse 80 × 40 m")
    app.wait_for_selector("text=This is a building")
    assert calls(app) == 0
    app.click(".ue-path:has-text('Open the building engine')")
    app.wait_for_selector("text=What type of project is it?")
    app.click(".stage-nav li >> nth=1")
    assert app.input_value(".num-input input >> nth=0") == "80"


# FR-012-10: End task keeps the conversation
def test_end_task_keeps_the_conversation(app):
    ask(app, "need t shirts for an event")
    app.wait_for_selector("text=Here's what I understood")
    app.click(".ue-turns-end")
    assert app.locator("text=Here's what I understood").count() == 0
    app.reload()
    app.click("text=Resume last conversation")
    app.wait_for_selector("text=You need custom T-shirts for an event.")
    assert calls(app) == 0  # restored, not asked again (calls reset on reload)


# FR-012-10: with no AI, the router still runs and the user picks a path
def test_without_ai_user_chooses_a_path():
    with pw.sync_playwright() as p:
        b, pg, errors = open_app(p, mock=False)
        ask(pg, "need t shirts for an event")
        pg.wait_for_selector(".ue-path:has-text('Manufacture it')")
        assert pg.locator(".ue-path:has-text('Buy / source it')").is_visible()
        assert pg.locator("text=Choose how to continue").is_visible()
        assert pg.input_value("#ue-ask") == "need t shirts for an event" or pg.locator("text=need t shirts for an event").count() >= 1
        b.close()
        assert not errors, errors


# FR-012-13 AC-8 (was FR-012-11 AC-6): a plain manufacturing request goes straight into the interview, no AI read
def test_mobile_manufacturing_goes_straight_to_interview(app):
    ask(app, "mobile manufacturing")
    app.wait_for_selector("text=Which fabric?", timeout=8000)  # the scripted interview
    assert app.locator("text=Here's what I understood").count() == 0
    assert "UNDERSTAND THE REQUEST" not in app.evaluate("window.__calls[0].p")  # first AI call is the research


# FR-012-11 FR-012-13 AC-8: an AI reply of intent "manufacture" opens the interview directly with the summary
def test_ai_manufacture_intent_opens_interview(app):
    ask(app, "500 mobile phones for my brand")
    app.wait_for_selector("text=Which fabric?", timeout=8000)
    assert app.locator("text=Here's what I understood").count() == 0
    assert "UNDERSTAND THE REQUEST" in app.evaluate("window.__calls[0].p")
    assert "You want to manufacture mobile phones." in app.evaluate("window.__calls[1].p")


# FR-012-14 AC-9: every reply offers the full interview in one click
def test_start_full_interview_from_answer_and_sourcing(app):
    ask(app, "which fabric is best for summer t-shirts?")
    app.wait_for_selector("text=Combed cotton, 160–180 GSM")
    app.click(".ue-path:has-text('Start full requirements')")
    app.wait_for_selector("text=Which fabric?", timeout=8000)
    app.click("text=End task")
    ask(app, "need t shirts for an event")
    app.wait_for_selector("text=Here's what I understood")
    app.click(".ue-path:has-text('Buy / source it')")
    app.wait_for_selector(".ue-sourcing")
    assert app.locator(".ue-turn:last-of-type .ue-path:has-text('Start full requirements')").count() == 1
    app.click(".ue-turn:last-of-type .ue-path:has-text('Start full requirements')")
    app.wait_for_selector("text=Which fabric?", timeout=8000)


# FR-012-11: an AI "unclear" on a real request still offers the paths
def test_ai_unclear_on_real_request_offers_paths(app):
    ask(app, "need cricket bats")
    app.wait_for_selector("text=Here's what I understood")
    assert app.locator("text=I didn't understand that").count() == 0
    for label in ["Buy / source it", "Manufacture it", "Build it", "Just advise me"]:
        assert app.locator(f".ue-path:has-text('{label}')").count() == 1


# FR-012-12 AC-7
def test_temple_goes_to_ai_construction_interview_not_factory(app):
    ask(app, "i have planned to build a hindu temple")
    app.wait_for_selector("text=You plan to build a Hindu temple.")
    app.click(".ue-q >> nth=0 >> .ue-opt:has-text('Dravidian')")
    app.click(".ue-path:has-text('Build it')")
    app.wait_for_selector("text=Which fabric?", timeout=8000)  # the scripted AI interview
    assert app.locator("text=What type of project is it?").count() == 0
    p = app.evaluate("window.__calls[1].p")
    assert "temple" in p.lower() and "CONSTRUCTION" in p and "Dravidian" in p


# FR-014-01 FR-014-02 FR-014-03 AC-1: raw materials box comes first, before the interview questions
def test_raw_materials_box_before_interview_questions(app):
    ask(app, "need t shirts for an event")
    app.wait_for_selector("text=Here's what I understood")
    app.click(".ue-path:has-text('Manufacture it')")
    app.wait_for_selector("#raw-materials", timeout=8000)
    box = app.locator("#raw-materials")
    assert box.locator(".rm-tile").count() == 3
    assert "Tiruppur" in box.inner_text() and "₹260–320 per kg" in box.inner_text()
    assert box.locator(".rm-imported").inner_text() == "Imported from Japan"
    first_q = app.locator(".question").first.bounding_box()
    assert box.bounding_box()["y"] < app.locator(".card.overview").bounding_box()["y"] < first_q["y"]
    assert app.locator(".rm-link").inner_text() == "Raw materials (3)"


# FR-014-04 FR-014-05 AC-2 AC-3: building engine box, built in code, live
def test_building_materials_box_updates_live(app):
    ask(app, "PEB warehouse 80 × 40 m")
    app.click(".ue-path:has-text('Open the building engine')")
    app.wait_for_selector("#raw-materials")
    assert app.locator("#raw-materials .rm-tile").count() == 4  # compact first view
    app.click(".rm-more")
    t = app.locator("#raw-materials").inner_text()
    assert "Structural steel" in t and "IS 2062 E350" in t and "Cold-formed" in t  # PEB default grade is E350
    assert calls(app) == 0  # no AI
    app.locator(".option:has-text('House / residential')").first.click()
    app.wait_for_timeout(300)
    t = app.locator("#raw-materials").inner_text()
    assert "Cement" in t and "TMT" in t and "Walling" in t and "Structural steel" not in t


# FR-012-08: a question that mentions a building is answered, not sent to the building engine
def test_question_about_a_house_is_answered(app):
    ask(app, "which fabric is best for a house?")
    app.wait_for_selector("text=Combed cotton, 160–180 GSM")
    assert app.locator("text=This is a building").count() == 0


# FR-014-03: a new screen opens at the top, so the raw materials box is the first thing seen
def test_new_screen_opens_at_the_top(app):
    ask(app, "i have planned to build a hindu temple")
    app.wait_for_selector("text=You plan to build a Hindu temple.")
    app.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    assert app.evaluate("window.scrollY") > 0
    app.click(".ue-path:has-text('Build it')")
    app.wait_for_selector("#raw-materials", timeout=8000)
    app.wait_for_timeout(300)
    assert app.evaluate("window.scrollY") == 0
    assert app.locator("#raw-materials").bounding_box()["y"] < 720
