import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// A production build must never talk to the API over plain http (tokens
// and sales would travel unencrypted). Local addresses stay allowed so a
// developer can still build against http://localhost.
function assertSecureApiUrl(mode: string) {
  if (mode !== 'production') return
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL || ''
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(apiUrl)
  if (/^http:\/\//i.test(apiUrl) && !isLocal) {
    throw new Error(`VITE_API_URL must use https:// in production builds (got ${apiUrl}).`)
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  assertSecureApiUrl(mode)
  return {
  build: {
    // Never publish source maps for the production bundle.
    sourcemap: false,
  },
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
            src: '/icons/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(?:api|sales|products|customers|expenses|entries|auth|exchangeRates|reports|print|users|categories)(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        // Operational/API requests are intentionally not registered with
        // Workbox at all. The browser owns their normal network failure and
        // IndexedDB owns controlled offline business data. This avoids
        // Workbox's rejected `NetworkOnly` response (`no-response`) while
        // still guaranteeing that no API response enters Cache Storage.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  }
})
