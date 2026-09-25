import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Opus Ball — Manager Career',
        short_name: 'Opus Ball',
        description: 'Mobile football manager career with real EA SPORTS FC 27 ratings and the real 2026/27 season.',
        theme_color: '#05070c',
        background_color: '#05070c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell, fonts, database, crests, competition logos and flags are all available offline
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,json}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Opus Ball art (Higgsfield CDN)
            urlPattern: /^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'opus-art', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // real player headshots and crests from the SoFIFA CDN, cached once seen
            urlPattern: /^https:\/\/cdn\.sofifa\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sofifa-images',
              expiration: { maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 120 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
