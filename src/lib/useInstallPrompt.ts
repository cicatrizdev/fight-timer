import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
})

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(deferredPrompt !== null)

  useEffect(() => {
    const update = () => setCanInstall(deferredPrompt !== null)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  return {
    canInstall: canInstall && !isStandalone(),
    showIOSHint: isIOS() && !isStandalone(),
    promptInstall: async () => {
      if (!deferredPrompt) return
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      deferredPrompt = null
      setCanInstall(false)
    },
  }
}
