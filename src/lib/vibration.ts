// Haptic cues (Android; iOS Safari does not expose the Vibration API).

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Ignore — purely a nice-to-have.
  }
}
