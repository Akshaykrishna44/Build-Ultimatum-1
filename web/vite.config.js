import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the whole app into one self-contained index.html (easy to host anywhere).
export default defineConfig({
  resolve: {
    // spec 015: jsPDF's optional add-ons are never used (no html() / SVG); stub them to keep the page small
    alias: { html2canvas: '/src/report/stubs/empty.js', dompurify: '/src/report/stubs/empty.js', canvg: '/src/report/stubs/empty.js' },
  },
  plugins: [react(), viteSingleFile()],
  server: {
    // During local development, AI calls go to the small Node proxy in /server
    proxy: { '/api': 'http://localhost:8787' },
  },
})
