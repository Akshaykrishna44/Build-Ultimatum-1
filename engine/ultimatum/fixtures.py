"""Offline fixtures used by FakeLLM (ULTIMATUM_LLM=fake). Illustrative numbers only."""

MAP = {
    "domain": "Footwear",
    "product_title": "Men's leather formal shoes",
    "summary": "Leather formal shoes are cut, stitched, lasted and soled. Upper leather is the largest cost driver, and cutting wastage depends on hide quality and nesting.",
    "raw_materials": [
        {"material": "Finished cow leather", "used_for": "Shoe upper", "grades": ["Full grain", "Corrected grain"], "india_sources": ["Kanpur", "Ambur–Vaniyambadi", "Kolkata"], "typical_price": "₹90–180 per sq ft", "imported": False},
        {"material": "Rubber / TPR outsole", "used_for": "Sole", "grades": ["TPR", "Rubber", "PU"], "india_sources": ["Agra", "Chennai sole makers"], "typical_price": "₹60–180 per pair", "imported": False},
    ],
    "key_considerations": ["Upper leather drives 40–55% of material cost", "Construction method sets durability and price tier", "Size mix decides last and die investment"],
    "stages": [
        {"id": "s1", "title": "Variants & specifications", "intro": "Define the shoe.", "questions": [
            {"id": "shoe_type", "q": "Which shoe type?", "why": "Sets pattern and leather consumption", "type": "single",
             "options": [{"value": "oxford", "label": "Oxford", "note": "Closed lacing, most formal"},
                         {"value": "derby", "label": "Derby", "note": "Open lacing, easier fit"},
                         {"value": "loafer", "label": "Loafer", "note": "No laces, ~10% less leather"}],
             "default": "oxford"},
            {"id": "construction", "q": "Construction method?", "why": "Durability vs cost", "type": "single",
             "options": [{"value": "cemented", "label": "Cemented", "note": "Cheapest, fastest"},
                         {"value": "goodyear", "label": "Goodyear welt", "note": "Resoleable, premium"}],
             "default": "cemented"}]},
        {"id": "s2", "title": "Commercial terms", "intro": "Money settings.", "questions": [
            {"id": "overhead_pct", "q": "Overhead %?", "why": "Factory costs", "type": "number", "unit": "%", "default": 12},
            {"id": "contingency_pct", "q": "Contingency %?", "why": "Buffer", "type": "number", "unit": "%", "default": 5},
            {"id": "margin_pct", "q": "Margin %?", "why": "Profit", "type": "number", "unit": "%", "default": 15},
            {"id": "tax_pct", "q": "GST %?", "why": "Tax", "type": "number", "unit": "%", "default": 12}]},
    ],
}

FOLLOWUPS = {"questions": [
    {"id": "welt_type", "q": "Which welt material?", "why": "Goodyear welt needs a welt strip", "type": "single",
     "options": [{"value": "leather_welt", "label": "Leather welt", "note": "Traditional"},
                 {"value": "rubber_welt", "label": "Rubber welt", "note": "Cheaper"}],
     "default": "leather_welt"}]}

ESTIMATE = {
    "product_title": "Men's leather oxford (cemented)", "summary": "50,000 pairs, full-grain upper, rubber sole.",
    "unit_label": "pairs", "price_basis": "Illustrative fixture data",
    "options_catalog": [{"category": "Sole", "options": [
        {"name": "Leather", "description": "Classic", "cost_impact": "High", "quality": "A", "best_for": "Formal"},
        {"name": "Rubber", "description": "Durable", "cost_impact": "Low", "quality": "B", "best_for": "Daily wear"}]}],
    "breakdowns": [{"title": "Size mix", "rows": [{"label": "UK 7", "share_pct": 20}, {"label": "UK 8", "share_pct": 30}, {"label": "UK 9", "share_pct": 30}, {"label": "UK 10", "share_pct": 20}]}],
    "bom": [
        {"component": "Upper", "material": "Full-grain cow leather", "grade": "A", "consumption_per_unit": 2, "unit": "sq ft", "wastage_pct": 12, "rate_low": 90, "rate_likely": 110, "rate_high": 140},
        {"component": "Sole", "material": "Rubber", "grade": "B", "consumption_per_unit": 1, "unit": "pair", "wastage_pct": 2, "rate_low": 60, "rate_likely": 80, "rate_high": 110}],
    "sourcing": [{"material": "Upper leather", "region": "Ambur / Vaniyambadi, TN", "source_type": "Tannery", "price_range": "90–140 / sq ft", "quality_grade": "A", "lead_time": "3 weeks", "moq": "5,000 sq ft"}],
    "labour": [{"skill": "Stitcher", "minutes_per_unit": 25, "rate_per_hour": 80, "headcount": 60}],
    "one_time_costs": [{"item": "Lasts (per size)", "qty": 200, "unit_cost": 900, "include_in_order": True}],
    "per_unit_costs": {"packaging": 25, "logistics": 15, "utilities": 10},
    "percentages": {"overhead_pct": 12, "contingency_pct": 5, "margin_pct": 15, "tax_pct": 12},
    "market_price": {"low": 1200, "likely": 1800, "high": 3000},
    "process_steps": [{"step": "Cutting", "description": "Clicking press with dies", "machine": "Clicker press"}],
    "compliance": ["BIS IS 1989 (example)"], "timeline": [{"phase": "Sampling", "duration": "3 weeks"}],
    "assumptions": ["Fixture data"], "risks": [{"risk": "Leather price rise", "mitigation": "Lock rates for 90 days"}],
}


# Spec 012 fixtures
UNDERSTANDING = {
    "intent": "buy_source",
    "summary": "You need custom T-shirts for an event.",
    "questions": [
        {"id": "qty", "q": "How many T-shirts do you need?", "options": ["50", "100", "200", "500"]},
        {"id": "date", "q": "When is the event?", "options": ["Within 1 week", "2–3 weeks", "A month or more"]},
    ],
    "paths": ["buy", "make", "advise"],
}
SOURCING = {
    "currency": "INR",
    "options": [{"name": "Custom-printed T-shirts", "unit_price": {"low": 150, "likely": 200, "high": 260},
                 "customisation_per_unit": {"low": 20, "likely": 30, "high": 45}, "delivery_total": {"low": 0, "likely": 500, "high": 1000},
                 "moq": "50", "lead_time": "7–10 days", "where": ["Tiruppur printers"], "total": 1}],
    "tips": ["Order 5% extra."],
}
