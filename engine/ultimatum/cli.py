"""Interactive terminal interview, using the same engine as the API.

    python -m ultimatum.cli "men's leather formal shoes" 50000 pairs --location "Tamil Nadu" --currency INR
"""
from __future__ import annotations

import argparse
import sys

from .agents.interviewer import is_answered
from .calc import calculate
from .engine import UltimatumEngine
from .exporter import report_md
from .schemas import ProjectRequest


def ask(q) -> object:
    print(f"\n  {q.q}" + (f"   ({q.why})" if q.why else ""))
    if q.type in ("single", "multi"):
        for i, o in enumerate(q.options, 1):
            mark = "*" if (o.value == q.default or (isinstance(q.default, list) and o.value in q.default)) else " "
            print(f"   {mark}{i}. {o.label}" + (f": {o.note}" if o.note else ""))
        raw = input("   choice" + (" (comma-separated)" if q.type == "multi" else "") + " [Enter = default *]: ").strip()
        if not raw:
            return q.default
        try:
            picks = [q.options[int(x) - 1].value for x in raw.split(",")]
        except (ValueError, IndexError):
            return raw  # free text "other"
        return picks if q.type == "multi" else picks[0]
    raw = input(f"   answer{' (' + q.unit + ')' if q.unit else ''} [Enter = {q.default}]: ").strip()
    if not raw:
        return q.default
    if q.type == "number":
        try:
            return float(raw)
        except ValueError:
            return q.default
    return raw


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ultimatum Engine: terminal expert interview")
    ap.add_argument("product"); ap.add_argument("qty", type=float); ap.add_argument("unit", nargs="?", default="units")
    ap.add_argument("--location", default="India"); ap.add_argument("--currency", default="INR")
    ap.add_argument("--quick", action="store_true", help="accept all expert defaults")
    ap.add_argument("--out", help="write the Markdown report to this file")
    a = ap.parse_args(argv)

    eng = UltimatumEngine()
    print("Researching the domain…")
    p = eng.create_project(ProjectRequest(product=a.product, qty=a.qty, unit=a.unit, location=a.location, currency=a.currency))
    print(f"\n{p.map.product_title} [{p.map.domain}]\n{p.map.summary}")
    if not a.quick:
        p.answers = {}
        for st in p.map.stages:
            print(f"\n== {st.title} ==  {st.intro}")
            for q in st.questions:
                p.answers[q.id] = ask(q)
            eng.answer(p.id, p.answers, replace=True)
            p, new = eng.followups(p.id, st.id)
            for q in new:
                print("  ↳ follow-up")
                p.answers[q.id] = ask(q)
            eng.answer(p.id, p.answers, replace=True)
    print("\nBuilding the estimate…")
    p, warnings = eng.estimate(p.id)
    t = calculate(p.estimate, p.request.qty, p.pct)
    c = p.request.currency
    for s in ("low", "likely", "high"):
        print(f"  {s:>6}: {c} {t[s]['total']:,.0f}   ({c} {t[s]['per_unit_total']:,.2f} per unit)")
    for w in warnings:
        print("  ! " + w)
    if a.out:
        open(a.out, "w").write(report_md(p))
        print("Report written to " + a.out)
    print(f"Project id: {p.id}")


if __name__ == "__main__":
    sys.exit(main())
