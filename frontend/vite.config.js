import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/v1/auth': {
        target: 'http://localhost:8081',
        changeOrigin: true
      },
      '/api/v1/accounts': {
        target: 'http://localhost:8082',
        changeOrigin: true
      },
      '/api/v1/transactions': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/admin': {
        target: 'http://localhost:8082',
        changeOrigin: true
      }
    }
  }
})