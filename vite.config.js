import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
    proxy: {
      // Forwards all /api/* calls to the live Cloudflare Pages deployment
      // so local dev uses the real production D1 database
      '/api': {
        target: 'https://money-erp-uae.pages.dev',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
