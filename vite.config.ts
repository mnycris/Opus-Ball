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
            // official EA headshots, PlayStyle icons and crests; SoFIFA mirror; football-logos.cc crests; Wikipedia photos
            urlPattern: /^https:\/\/(ratings-images-prod\.pulse\.ea\.com|drop-assets\.ea\.com|cdn\.sofifa\.net|cdn\.futwiz\.com|cdn\.futbin\.com|assets\.football-logos\.cc|upload\.wikimedia\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'football-images',
              // opaque cross-origin images count heavily against quota: cap entries and purge instead of failing
              expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 120, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'wiki-summaries', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
