import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Dev rejimida /api va /uploads backendga yo'naltiriladi, shuning uchun
// brauzer uchun hammasi bitta origin bo'lib ko'rinadi va CORS muammosi chiqmaydi.
// Backend manzili: odatda localhost:8000, lekin boshqa portda ishlayotgan
// nusxaga ulanish uchun VITE_API_PROXY bilan almashtirish mumkin.
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Grafik kutubxonasi faqat statistika sahifalarida kerak
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
})
