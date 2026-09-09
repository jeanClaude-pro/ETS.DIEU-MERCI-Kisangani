import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A deployment waits until every app window is closed before activating.
      // This never reloads a cashier's in-progress form unexpectedly.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: "Boutique C'EST DIEU QUI PARTAGE",
        short_name: "C'EST DIEU",
        description: 'Système interne de gestion de boutique, stock et point de vente.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#1d4ed8',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        runtimeCaching: [
          {
            // Authenticated operational data always comes from the API.
            urlPattern: ({ request, url }) =>
              request.destination === '' && /^\/api(?:\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'GET',
            options: { cacheName: 'api-network-only' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
