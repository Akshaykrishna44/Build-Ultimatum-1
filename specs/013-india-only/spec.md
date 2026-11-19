# Spec 013 — India only

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-18 |
| **Shipped in** | v0.8.1 (outsourcing rule v0.8.2) |
| **Modes** | both |
| **Depends on** | 002 (AI product engine), 012 (understand first) |

## 0. Mission fit
**Any request, every aspect, a smart solution, for India.** AK, 2026-11-18: "for now focus on india alone no need for any other countries". One market makes every rate, supplier, tax and rule sharper: rupees, GST, Indian standards, Indian clusters and suppliers.

## 1. Problem
The engine asked for a currency (8 choices) and a "city / state / country", and prompts allowed any country's market, so answers could drift to US/EU rates, foreign regulators and foreign suppliers.

## 2. Goals / Non-goals
**Goals:** India is the only market; prices only in ₹ (lakh/crore format); GST; Indian regulators and standards; Indian suppliers, clusters, mandis and B2B portals.
**Non-goals:** export markets (removed for now); multi-currency. Inputs are outsourced from abroad only when nothing suitable is found in India.

## 3. User stories
- As a user in India, I'm never asked which currency or country; I'm asked which state or city in India.
- As a user, every price is in ₹ and tax is GST.

## 4. Functional requirements
| ID | Requirement |
|---|---|
| FR-013-01 | Currency is always INR. No currency question is asked; any other currency in a request or answer is replaced by INR (web and Python). |
| FR-013-02 | The location question asks "Which state or city in India?" (default Tamil Nadu). The stored location always ends in ", India". |
| FR-013-03 | Every AI prompt (understand, advise, sourcing, research, follow-ups, estimate, expert chat) states the market is India only: ₹ prices, GST slabs, Indian regulators and standards (BIS/IS, CDSCO, FSSAI, BEE, PESO, Pollution Control Boards, NBC), Indian suppliers, clusters, mandis and B2B portals. Sourcing rows name a city/cluster/state in India. India first; only when nothing suitable is found in India is the item outsourced from abroad, marked "imported" with country of origin, Indian importer/distributor if any, customs duty and extra lead time. |
| FR-013-04 | Domain packs name only Indian regulation; references to export rules (EU MDR/CE, US FDA, REACH, OEKO-TEX, export compliance) are removed. |
| FR-013-05 | The tax question is "GST rate?" with the GST slab as default. |

## 5. Calculations & rules
Unchanged. Money is formatted en-IN (₹, lakh/crore grouping).

## 6. Acceptance criteria
- AC-1: A new interview has no currency question and asks "Which state or city in India?".
- AC-2: Answering currency "USD" (old saved project) still prices in INR.
- AC-3: Prompts contain "India only" and "GST"; no prompt offers "country".
- AC-4: No domain pack mentions FDA, CE, EU MDR, REACH, OEKO-TEX or export compliance.

## 7. Non-functional requirements
None new.

## 8. Open questions / clarifications
| # | Question | Decision |
|---|---|---|
| C1 | Allow imported components (e.g. chips from China)? | Yes. AK, 2026-11-18: "when nothing found in india you can outsource it". Marked imported, with country of origin, importer, customs duty and lead time. |
| C2 | Selling abroad (export)? | Out of scope for now (AK: no other countries). |

## 9. Out of scope / future
Export markets and multi-currency, if AK asks later.
