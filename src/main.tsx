import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './i18n'
import './index.css'
import App from './App.tsx'
import { applyAudioSessionType } from './core/audio/AudioManager'
import { useConfigStore } from './stores/configStore'

registerSW({ immediate: true })

applyAudioSessionType(useConfigStore.getState().ignoreSilentSwitch)
useConfigStore.subscribe((s, prev) => {
  if (s.ignoreSilentSwitch !== prev.ignoreSilentSwitch) applyAudioSessionType(s.ignoreSilentSwitch)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
