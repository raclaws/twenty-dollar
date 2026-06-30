import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '20 Dollar is Expensive',
        short_name: '20Dollar',
        theme_color: '#1e1e2e',
        background_color: '#1e1e2e',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
