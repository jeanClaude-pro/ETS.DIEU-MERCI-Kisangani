import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Conservative update policy: the new worker waits and activates after all
// open POS windows close. No deployment can force-refresh an unfinished sale.
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.info("Une mise à jour sera appliquée à la prochaine réouverture de l'application.")
  },
  onOfflineReady() {
    console.info("L'interface est prête. Les opérations métier nécessitent toujours le serveur.")
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
