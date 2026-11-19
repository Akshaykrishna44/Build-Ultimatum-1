// Spec 014: "Raw materials needed" rows from the research step, normalised in code (FR-014-02).
const str = (v) => (v === undefined || v === null ? '' : String(v).trim())
const list = (v, n) => (Array.isArray(v) ? v : v ? [v] : []).map(str).filter(Boolean).slice(0, n)
const yes = (v) => v === true || /^(true|yes|y|1|imported)$/i.test(str(v))

export function normaliseMaterials(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && str(r.material))
    .slice(0, 14)
    .map((r) => {
      const imported = yes(r.imported)
      return {
        material: str(r.material),
        used_for: str(r.used_for),
        grades: list(r.grades, 5),
        india_sources: list(r.india_sources, 4),
        typical_price: str(r.typical_price),
        imported,
        origin: imported ? str(r.origin) : '',
      }
    })
}
