export function formatSeconds(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatMsClock(ms: number): string {
  return formatSeconds(Math.ceil(Math.max(0, ms) / 1000))
}
