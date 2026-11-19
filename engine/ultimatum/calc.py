"""Deterministic calculation engine — identical formulas to web/src/calc.js.

Gross qty   = net ÷ (1 − wastage%)
Material    = Σ gross × rate
Labour      = Σ minutes/unit × qty ÷ 60 × rate/hour
Direct      = material + labour + one-time (charged) + per-unit costs × qty
Overhead    = direct × overhead%
Contingency = (direct + overhead) × contingency%
Cost        = direct + overhead + contingency
Margin      = cost × margin%
Tax         = (cost + margin) × tax%
Total       = cost + margin + tax
"""
from __future__ import annotations

from .schemas import BomRow, Estimate, Percentages

SCENARIOS = ("low", "likely", "high")


def net_qty(row: BomRow, qty: float) -> float:
    return row.consumption_per_unit * qty


def gross_qty(row: BomRow, qty: float) -> float:
    w = min(max(row.wastage_pct, 0), 95) / 100
    return net_qty(row, qty) / (1 - w)


def calculate(est: Estimate, qty: float, pct: Percentages) -> dict:
    out: dict = {}
    for s in SCENARIOS:
        material = sum(gross_qty(b, qty) * getattr(b, f"rate_{s}") for b in est.bom)
        labour = sum(l.minutes_per_unit * qty / 60 * l.rate_per_hour for l in est.labour)
        one_time = sum((o.qty or 1) * o.unit_cost for o in est.one_time_costs if o.include_in_order)
        per_unit = sum(float(v or 0) for v in est.per_unit_costs.values()) * qty
        direct = material + labour + one_time + per_unit
        overhead = direct * pct.overhead_pct / 100
        contingency = (direct + overhead) * pct.contingency_pct / 100
        cost = direct + overhead + contingency
        margin = cost * pct.margin_pct / 100
        tax = (cost + margin) * pct.tax_pct / 100
        total = cost + margin + tax
        out[s] = {
            "material": material, "labour": labour, "one_time": one_time, "per_unit": per_unit,
            "direct": direct, "overhead": overhead, "contingency": contingency, "cost": cost,
            "margin": margin, "tax": tax, "total": total,
            "per_unit_total": total / qty if qty else 0, "per_unit_cost": cost / qty if qty else 0,
        }
    out["labour_hours"] = sum(l.minutes_per_unit * qty / 60 for l in est.labour)
    out["headcount"] = sum(l.headcount for l in est.labour)
    out["waste_value"] = sum((gross_qty(b, qty) - net_qty(b, qty)) * b.rate_likely for b in est.bom)
    out["bom"] = [
        {"component": b.component, "net_qty": net_qty(b, qty), "gross_qty": gross_qty(b, qty),
         "cost_likely": gross_qty(b, qty) * b.rate_likely}
        for b in est.bom
    ]
    return out


def totals_text(est: Estimate, qty: float, pct: Percentages, currency: str) -> str:
    t = calculate(est, qty, pct)["likely"]
    return (f"Grand total {currency} {t['total']:,.0f}; per unit {currency} {t['per_unit_total']:,.2f}; "
            f"materials {t['material']:,.0f}; labour {t['labour']:,.0f}. Key materials: "
            + ", ".join(f"{b.component} ({b.material})" for b in est.bom))
