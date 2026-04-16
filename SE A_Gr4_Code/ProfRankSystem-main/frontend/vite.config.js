import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all requests starting with '/api' to your backend
      '/api': {
        target: 'http://localhost:9000',  // Your backend runs here locally
        changeOrigin: true,               // Changes the origin header to match the target (avoids some CORS issues)
        secure: false,                    // Since you're using HTTP, not HTTPS
        // Optional rewrite: If your backend routes are exactly '/api/...', this keeps it the same
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  }
})