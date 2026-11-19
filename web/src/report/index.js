// Spec 015: build and save a final report (PDF or Excel) through the claude.ai downloads capability or the browser.
import { saveFile } from '../export.js'
import { renderPDF } from './pdf.js'
import { renderXLSX } from './xlsx.js'

export const reportDate = () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const appVersion = () => (typeof document !== 'undefined' && document.querySelector('meta[name="ultimatum-version"]')?.content) || ''

/** FR-015-08: returns 'saved' | 'declined' | 'failed' (with a short message for the UI). */
export async function downloadReport(model, kind) {
  try {
    if (kind === 'xlsx') await saveFile(model.filename + '.xlsx', renderXLSX(model), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    else await saveFile(model.filename + '.pdf', await renderPDF(model), 'application/pdf')
    return { status: 'saved', message: kind === 'xlsx' ? 'Workbook ready' : 'Final report ready' }
  } catch (e) {
    if (e && e.code === 'declined') return { status: 'declined', message: 'Download cancelled' }
    return { status: 'failed', message: 'Could not create the file. Please try again.' }
  }
}
