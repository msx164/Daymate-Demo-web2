import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  define: { 'import.meta.env.VITE_DAYMATE_BUILD': JSON.stringify(new Date().toISOString()) },
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  plugins: [react()],
  cacheDir: '../.sandbox/vite-cache',
  build: { assetsInlineLimit: 0 },
})

