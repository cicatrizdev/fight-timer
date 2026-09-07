// Keeps the screen on while a workout is running. Wake locks are released by
// the OS whenever the page is hidden, so we re-acquire on visibilitychange.

let sentinel: WakeLockSentinel | null = null
let wanted = false

async function acquire(): Promise<void> {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // Low battery / unsupported: not fatal.
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible' && !sentinel) void acquire()
})

export function keepScreenOn(): void {
  wanted = true
  void acquire()
}

export function releaseScreen(): void {
  wanted = false
  void sentinel?.release()
  sentinel = null
}
