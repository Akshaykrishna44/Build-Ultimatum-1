"""Exports: Markdown report, BOM CSV, cost-sheet CSV."""
from __future__ import annotations

import csv
import io

from .calc import calculate, gross_qty, net_qty
from .schemas import Project

LINES = [("Materials (incl. wastage)", "material"), ("Labour", "labour"), ("One-time costs charged", "one_time"),
         ("Packaging, logistics, utilities", "per_unit"), ("Direct cost", "direct"), ("Overhead", "overhead"),
         ("Contingency", "contingency"), ("Total cost", "cost"), ("Margin", "margin"), ("Tax", "tax"),
         ("GRAND TOTAL", "total"), ("Price per unit", "per_unit_total")]


def safe(v):
    """Bug sweep 2026-11-19: text cells starting with = + - @ would run as formulas in Excel; prefix them with '."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def bom_csv(p: Project) -> str:
    q, buf = p.request.qty, io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Component", "Material", "Grade", "Consumption/unit", "Unit", "Net qty", "Wastage %", "Gross qty",
                "Rate low", "Rate likely", "Rate high", "Cost likely", "Note"])
    for b in p.estimate.bom:
        g = gross_qty(b, q)
        w.writerow([safe(x) for x in (b.component, b.material, b.grade, b.consumption_per_unit, b.unit, round(net_qty(b, q), 2),
                    b.wastage_pct, round(g, 2), b.rate_low, b.rate_likely, b.rate_high, round(g * b.rate_likely, 2), b.note)])
    return buf.getvalue()


def cost_csv(p: Project) -> str:
    t, buf = calculate(p.estimate, p.request.qty, p.pct), io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Line", "Low", "Likely", "High"])
    for label, k in LINES:
        w.writerow([label] + [round(t[s][k], 2) for s in ("low", "likely", "high")])
    return buf.getvalue()


def report_md(p: Project) -> str:
    r, e, m, pct = p.request, p.estimate, p.map, p.pct
    t = calculate(e, r.qty, pct)
    f = lambda n: f"{r.currency} {n:,.0f}"  # noqa: E731
    L = [f"# {e.product_title or m.product_title}",
         f"**Quantity:** {r.qty:,.0f} {r.unit} · **Location:** {r.location} · **Currency:** {r.currency}", "",
         e.summary or m.summary, "", f"_Price basis: {e.price_basis or 'AI market estimate'}. Verify with supplier quotes._", "",
         "## Estimate summary", "| | Low | Likely | High |", "|---|---|---|---|"]
    for label, k in LINES:
        L.append(f"| {label} | {f(t['low'][k])} | {f(t['likely'][k])} | {f(t['high'][k])} |")
    L += ["", f"Overhead {pct.overhead_pct}% · Contingency {pct.contingency_pct}% · Margin {pct.margin_pct}% · Tax {pct.tax_pct}%",
          "", "## Bill of materials", "| Component | Material | Cons./unit | Wastage | Gross qty | Rate | Cost |", "|---|---|---|---|---|---|---|"]
    for b in e.bom:
        g = gross_qty(b, r.qty)
        L.append(f"| {b.component} | {b.material} {b.grade} | {b.consumption_per_unit} {b.unit} | {b.wastage_pct}% | {g:,.1f} {b.unit} | {b.rate_likely:g} | {f(g * b.rate_likely)} |")
    L += ["", "## Sourcing"] + [f"- **{s.material}**: {s.region} ({s.source_type}), {s.price_range}, grade {s.quality_grade}, lead {s.lead_time}, MOQ {s.moq}" for s in e.sourcing]
    L += ["", "## Assumptions"] + [f"- {a}" for a in e.assumptions]
    L += ["", "## Risks"] + [f"- **{x.risk}**: {x.mitigation}" for x in e.risks]
    srcs = (m.sources or []) + (e.sources or [])
    if srcs:
        L += ["", "## Sources"] + [f"- [{s.title or s.url}]({s.url})" for s in srcs]
    return "\n".join(L)
