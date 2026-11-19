"""Universal data model — the same shapes for every domain (shoes, TVs, buildings, crops...)."""
from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


class Loose(BaseModel):
    # LLM output can carry extra keys; keep them instead of failing.
    model_config = ConfigDict(extra="allow")


# ── Request ──────────────────────────────────────────────────
class ProjectRequest(Loose):
    # Bug sweep 2026-11-19: size limits so a request cannot run up an unbounded AI bill
    product: str = Field(..., min_length=2, max_length=2000, description="What to manufacture / build / grow / sell")
    qty: float = Field(0, ge=0, le=1e12, description="0 = not stated; the interview asks it (order_qty)")
    unit: str = Field("units", max_length=60)
    location: str = Field("India", max_length=200)
    currency: str = "INR"
    notes: str = Field("", max_length=6000)

    # Spec 013: India only, always INR
    @field_validator("currency", mode="before")
    @classmethod
    def _inr(cls, v):
        return "INR"

    @field_validator("location", mode="before")
    @classmethod
    def _india(cls, v):
        from .india import indian_location
        return indian_location(v)


# ── Knowledge map + interview ────────────────────────────────
class Option(Loose):
    value: str
    label: str
    note: str = ""


class Question(Loose):
    id: str
    q: str
    why: str = ""
    type: Literal["single", "multi", "number", "text"] = "text"
    options: list[Option] = []
    unit: Optional[str] = None
    default: Any = None
    followup: bool = False  # added by the interviewer agent after earlier answers


class Stage(Loose):
    id: str
    title: str
    intro: str = ""
    questions: list[Question] = []


class Source(Loose):
    title: str = ""
    url: str = ""

    # Security (bug sweep 2026-11-19): only http(s) links are kept; javascript:/data: links would run when clicked
    @field_validator("url", mode="before")
    @classmethod
    def _http_only(cls, v):
        v = str(v or "").strip()
        return v if v.lower().startswith(("https://", "http://")) else ""


class RawMaterial(Loose):
    """Spec 014: one 'Raw materials needed' row, shown before the interview."""
    material: str
    used_for: str = ""
    grades: list[str] = []
    india_sources: list[str] = []
    typical_price: str = ""
    imported: bool = False
    origin: str = ""


class KnowledgeMap(Loose):
    domain: str
    product_title: str
    summary: str = ""
    key_considerations: list[str] = []
    raw_materials: list[dict] = []
    stages: list[Stage]
    sources: list[Source] = []


# ── Estimate (unit-level data from the AI; totals come from calc.py) ──
class OptionItem(Loose):
    name: str
    description: str = ""
    cost_impact: str = ""
    quality: str = ""
    best_for: str = ""


class OptionCategory(Loose):
    category: str
    options: list[OptionItem] = []


class MixRow(Loose):
    label: str
    share_pct: float = 0


class Breakdown(Loose):
    title: str
    rows: list[MixRow] = []


class BomRow(Loose):
    assembly: str = ""
    category: str = "component"   # raw_material | component | sub_assembly | consumable | packaging
    make_or_buy: str = "buy"
    wastage_reason: str = ""
    component: str
    material: str = ""
    grade: str = ""
    consumption_per_unit: float = 0
    unit: str = ""
    wastage_pct: float = 0
    rate_low: float = 0
    rate_likely: float = 0
    rate_high: float = 0
    note: str = ""


class SourcingRow(Loose):
    material: str
    region: str = ""
    source_type: str = ""
    price_range: str = ""
    quality_grade: str = ""
    lead_time: str = ""
    moq: str = ""
    notes: str = ""


class LabourRow(Loose):
    skill: str
    minutes_per_unit: float = 0
    rate_per_hour: float = 0
    headcount: float = 0


class OneTimeCost(Loose):
    category: str = ""            # rnd | tooling | certification | setup | machinery
    item: str
    qty: float = 1
    unit_cost: float = 0
    include_in_order: bool = True
    note: str = ""


class Percentages(Loose):
    overhead_pct: float = 10
    contingency_pct: float = 5
    margin_pct: float = 15
    tax_pct: float = 18


class MarketPrice(Loose):
    low: float = 0
    likely: float = 0
    high: float = 0
    note: str = ""


class ProcessStep(Loose):
    step: str
    description: str = ""
    machine: str = ""


class Phase(Loose):
    phase: str
    duration: str = ""


class Risk(Loose):
    risk: str
    mitigation: str = ""


class Estimate(Loose):
    product_title: str = ""
    summary: str = ""
    unit_label: str = ""
    price_basis: str = ""
    options_catalog: list[OptionCategory] = []
    breakdowns: list[Breakdown] = []
    bom: list[BomRow]
    sourcing: list[SourcingRow] = []
    labour: list[LabourRow] = []
    one_time_costs: list[OneTimeCost] = []
    per_unit_costs: dict[str, float] = {}
    percentages: Percentages = Percentages()
    market_price: MarketPrice = MarketPrice()
    process_steps: list[ProcessStep] = []
    compliance: list[str] = []
    timeline: list[Phase] = []
    assumptions: list[str] = []
    risks: list[Risk] = []
    sources: list[Source] = []


# ── Project (what the engine stores) ─────────────────────────
class Project(Loose):
    id: str
    created_at: str
    updated_at: str
    request: ProjectRequest
    map: Optional[KnowledgeMap] = None
    answers: dict[str, Any] = {}
    estimate: Optional[Estimate] = None
    pct: Optional[Percentages] = None
    knowledge_id: Optional[str] = None
    reused_knowledge: bool = False
