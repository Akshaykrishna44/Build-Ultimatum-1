// Spec 015: render the report model as an A4 PDF (FR-015-05): cover, contents with page numbers,
// header and "Page x of y" on every page, tables that continue across pages, ₹ via an embedded font.
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { REGULAR, BOLD } from './fonts.js'
import { cellText } from './model.js'

const INK = [31, 40, 48] // gunmetal
const MUTED = [96, 106, 112]
const LINE = [214, 219, 205]
const LIME = [198, 241, 53]
const SOFT = [245, 247, 240]
const M = 40 // margin (pt)

function setup() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  doc.addFileToVFS('DejaVuSans.ttf', REGULAR)
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', BOLD)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold')
  doc.setFont('DejaVu', 'normal')
  return doc
}

const W = (doc) => doc.internal.pageSize.getWidth()
const H = (doc) => doc.internal.pageSize.getHeight()
const isNum = (c) => c && typeof c === 'object' && 'v' in c

function cover(doc, model) {
  const w = W(doc)
  doc.setFillColor(...INK).rect(0, 0, w, 300, 'F')
  doc.setFillColor(...LIME).rect(M, 238, 64, 5, 'F')
  doc.setTextColor(198, 241, 53).setFont('DejaVu', 'bold').setFontSize(10).text('ULTIMATUM ENGINE', M, 70)
  doc.setTextColor(255, 255, 255).setFontSize(26)
  const titleLines = doc.splitTextToSize(model.title, w - 2 * M).slice(0, 3)
  doc.text(titleLines, M, 130)
  doc.setFont('DejaVu', 'normal').setFontSize(14).setTextColor(215, 222, 210).text(model.subtitle, M, 130 + titleLines.length * 32 + 6)
  // key facts
  let y = 350
  doc.setFontSize(10)
  for (const [k, v] of model.meta) {
    doc.setTextColor(...MUTED).text(k, M, y)
    doc.setTextColor(...INK).text(doc.splitTextToSize(String(v), w - 2 * M - 150), M + 150, y)
    y += 20
  }
  // summary tiles
  if (model.summary.length) {
    y += 20
    const n = model.summary.length
    const gap = 12
    const tw = (w - 2 * M - gap * (n - 1)) / n
    model.summary.forEach((s, i) => {
      const x = M + i * (tw + gap)
      doc.setFillColor(...(i === 0 ? INK : SOFT)).setDrawColor(...LINE).roundedRect(x, y, tw, 86, 6, 6, i === 0 ? 'F' : 'FD')
      doc.setFont('DejaVu', 'normal').setFontSize(8.5).setTextColor(...(i === 0 ? [198, 241, 53] : MUTED)).text(s.label, x + 12, y + 20)
      doc.setFont('DejaVu', 'bold').setFontSize(16).setTextColor(...(i === 0 ? [255, 255, 255] : INK)).text(doc.splitTextToSize(s.value, tw - 24)[0], x + 12, y + 46)
      if (s.sub) doc.setFont('DejaVu', 'normal').setFontSize(8).setTextColor(...(i === 0 ? [215, 222, 210] : MUTED)).text(doc.splitTextToSize(s.sub, tw - 24)[0], x + 12, y + 66)
    })
  }
  doc.setFont('DejaVu', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text(doc.splitTextToSize('Planning estimate prepared with Ultimatum Engine. Figures are calculated by code from AI-researched rates and your answers; confirm prices with suppliers and designs with a qualified engineer before committing.', w - 2 * M), M, H(doc) - 60)
}

function heading(doc, text, y) {
  doc.setFillColor(...LIME).rect(M, y - 11, 4, 15, 'F')
  doc.setFont('DejaVu', 'bold').setFontSize(14).setTextColor(...INK).text(text, M + 12, y)
  return y + 14
}

function textBlock(doc, text, y, { size = 9.5, color = INK, bullet = false } = {}) {
  doc.setFont('DejaVu', 'normal').setFontSize(size).setTextColor(...color)
  const indent = bullet ? 12 : 0
  const lines = doc.splitTextToSize(String(text), W(doc) - 2 * M - indent)
  for (let i = 0; i < lines.length; i++) {
    if (y > H(doc) - 60) {
      doc.addPage()
      y = 70
    }
    if (bullet && i === 0) doc.text('•', M, y)
    doc.text(lines[i], M + indent, y)
    y += size * 1.45
  }
  return y + 4
}

function table(doc, b, y) {
  const small = !!b.small
  const usable = W(doc) - 2 * M
  const columnStyles = {}
  ;(b.cols || []).forEach((f, i) => (columnStyles[i] = { cellWidth: f * usable }))
  const body = b.rows.map((r) => r.map((c) => ({ content: cellText(c), styles: isNum(c) ? { halign: 'right' } : {} })))
  if (b.foot) body.push(b.foot.map((c) => ({ content: cellText(c), styles: { fontStyle: 'bold', fillColor: SOFT, halign: isNum(c) ? 'right' : 'left' } })))
  for (const row of body) if (b.emphasise && b.emphasise.includes(row[0].content)) row.forEach((c) => (c.styles = { ...c.styles, fontStyle: 'bold', fillColor: SOFT }))
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 64, bottom: 50 },
    head: b.head ? [b.head] : undefined,
    body,
    theme: 'grid',
    showHead: 'everyPage',
    styles: { font: 'DejaVu', fontSize: small ? 6.8 : 8.2, cellPadding: small ? 3 : 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { font: 'DejaVu', fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255], lineColor: INK },
    alternateRowStyles: { fillColor: [252, 253, 250] },
    columnStyles,
  })
  return doc.lastAutoTable.finalY + 14
}

function kv(doc, b, y) {
  const usable = W(doc) - 2 * M
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 64, bottom: 50 },
    body: b.rows.map(([k, v]) => [k, cellText(v)]),
    theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 }, textColor: INK, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: usable * 0.34, textColor: MUTED }, 1: { cellWidth: usable * 0.66, fontStyle: 'bold' } },
    didDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === 0) doc.setDrawColor(...LINE).setLineWidth(0.4).line(M, d.cell.y + d.cell.height, M + usable, d.cell.y + d.cell.height)
    },
  })
  return doc.lastAutoTable.finalY + 12
}

/** Render the report model to PDF bytes. */
export async function renderPDF(model) {
  const doc = setup()
  cover(doc, model)
  const starts = []
  doc.addPage()
  let y = 70
  for (const s of model.sections) {
    // a section with a wide table (9+ columns: bill of materials, cutting, …) goes on landscape pages as a whole
    const wideSection = s.blocks.some((b) => b.type === 'table' && b.head && b.head.length >= 9)
    if (wideSection) {
      doc.addPage('a4', 'landscape')
      y = 70
    } else if (y > H(doc) - 170 || doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight()) {
      doc.addPage('a4', 'portrait')
      y = 70
    }
    starts.push([s.title, doc.getNumberOfPages()])
    y = heading(doc, s.title, y + 6) + 6
    for (const b of s.blocks) {
      if (y > H(doc) - 90) {
        doc.addPage('a4', wideSection ? 'landscape' : 'portrait')
        y = 70
      }
      if (b.caption) {
        doc.setFont('DejaVu', 'bold').setFontSize(10.5).setTextColor(...INK).text(b.caption, M, y + 4)
        y += 16
      }
      if (b.type === 'text') y = textBlock(doc, b.text, y)
      else if (b.type === 'note') y = textBlock(doc, b.text, y, { size: 8.5, color: MUTED })
      else if (b.type === 'bullets') for (const it of b.items) y = textBlock(doc, it, y, { bullet: true }) - 2
      else if (b.type === 'kv') y = kv(doc, b, y)
      else if (b.type === 'table') y = table(doc, wideSection ? { ...b, small: false } : b, y)
    }
    y += 16
  }
  // contents page (inserted as page 2, so every section moves one page on)
  doc.insertPage(2)
  doc.setPage(2)
  let cy = heading(doc, 'Contents', 80) + 14
  doc.setFontSize(10.5)
  starts.forEach(([title, page], i) => {
    doc.setFont('DejaVu', 'normal').setTextColor(...INK).text(`${i + 1}.  ${title}`, M, cy)
    doc.setTextColor(...MUTED).text(String(page + 1), W(doc) - M, cy, { align: 'right' })
    doc.setDrawColor(...LINE).setLineDashPattern([1, 2], 0).line(M + 14 + doc.getTextWidth(`${i + 1}.  ${title}`), cy - 3, W(doc) - M - 20, cy - 3).setLineDashPattern([], 0)
    cy += 22
  })
  // header and footer on every page
  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    doc.setFont('DejaVu', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    if (p > 1) {
      doc.text(doc.splitTextToSize(`Ultimatum Engine · ${model.title}`, W(doc) * 0.6)[0], M, 34)
      doc.text(model.subtitle, W(doc) - M, 34, { align: 'right' })
      doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, 42, W(doc) - M, 42)
    }
    doc.text('Planning estimate · not a quotation or a design', M, H(doc) - 24)
    doc.text(`Page ${p} of ${n}`, W(doc) - M, H(doc) - 24, { align: 'right' })
  }
  doc.setProperties({ title: `${model.title} — ${model.subtitle}`, subject: model.subtitle, creator: 'Ultimatum Engine', author: 'Ultimatum Engine' })
  return new Uint8Array(doc.output('arraybuffer'))
}
