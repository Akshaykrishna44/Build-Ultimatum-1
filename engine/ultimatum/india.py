"""Spec 013: the engine serves India only (AK, 2026-11-18). Mirror of web/src/india.js."""
import re

INDIA = ("MARKET: India only (no other countries). All prices in Indian rupees (INR, ₹); tax is GST (use the correct GST slab). "
         "Use Indian regulators and standards (BIS / IS codes, CDSCO, FSSAI, BEE, PESO, State Pollution Control Boards, NBC), "
         "Indian suppliers, industrial clusters, mandis and B2B portals (IndiaMART, TradeIndia), and Indian wages and rates. "
         "Name places as city / cluster / state in India. Source from India first. Only when nothing suitable is found in India, outsource it from abroad: "
         "mark it \"imported\" and give the country of origin, an Indian importer or distributor if one exists, "
         "the customs duty and the extra lead time.")
DEFAULT_STATE = "Tamil Nadu"


def indian_location(s: str) -> str:
    t = (s or "").strip()
    if not t or "not stated" in t.lower():
        return DEFAULT_STATE + ", India"
    return t if re.search(r"\bindia\b", t, re.I) else t + ", India"
