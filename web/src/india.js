// Spec 013: the engine serves India only (AK, 2026-11-18). One place for the market rules.
export const INDIA = `MARKET: India only (no other countries). All prices in Indian rupees (INR, ₹); tax is GST (use the correct GST slab). Use Indian regulators and standards (BIS / IS codes, CDSCO, FSSAI, BEE, PESO, State Pollution Control Boards, NBC), Indian suppliers, industrial clusters, mandis and B2B portals (IndiaMART, TradeIndia), and Indian wages and rates. Name places as city / cluster / state in India. Source from India first. Only when nothing suitable is found in India, outsource it from abroad: mark it "imported" and give the country of origin, an Indian importer or distributor if one exists, the customs duty and the extra lead time.`

export const DEFAULT_STATE = 'Tamil Nadu'

/** FR-013-02: every stored location is in India. */
export function indianLocation(s) {
  const t = String(s || '').trim()
  if (!t || /not stated/i.test(t)) return DEFAULT_STATE + ', India'
  return /\bindia\b/i.test(t) ? t : t + ', India'
}
