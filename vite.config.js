import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const staticRoutes = {
  '/design-system': 'public/design-system/index.html',
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'static-html-routes',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const file = staticRoutes[req.url?.split('?')[0]]
          if (file) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(fs.readFileSync(path.resolve(__dirname, file), 'utf-8'))
          } else {
            next()
          }
        })
      },
    },
  ],
  define: {
    global: 'globalThis',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
