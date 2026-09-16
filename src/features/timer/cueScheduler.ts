import { audioManager } from '../../core/audio/AudioManager'
import { forecast } from '../../core/timer/engine'
import type { EngineState, TimerSettings } from '../../core/timer/types'
import { playCue, soundsFor } from './cues'

// Cue sounds are queued on the audio clock ahead of time, so they play on
// schedule while the app is in the background (e.g. behind YouTube) and page
// JS is throttled. Live ticks still drive the UI, voice and vibration.

const HORIZON_MS = 3 * 60_000
const REFILL_BELOW_MS = 90_000
const STEP_MS = 25
/** Audio clock drift that means the context was suspended and cues were lost. */
const LOST_MS = 400
/** Smaller drift (clock skew, jittery currentTime) just re-anchors the queue. */
const RESYNC_MS = 150

interface Plan {
  /** Simulated engine state at `until`, to continue the forecast from. */
  state: EngineState
  settings: TimerSettings
  until: number
  offsetMs: number
}

let plan: Plan | null = null
let queued: { at: number; cancel: () => void }[] = []

function cancelFrom(wallMs: number) {
  queued = queued.filter((q) => {
    if (q.at > wallMs) q.cancel()
    return q.at <= wallMs
  })
}

function extend(p: Plan, now: number) {
  const target = now + HORIZON_MS
  const { events, state } = forecast(p.state, p.settings, p.until, target, STEP_MS)
  for (const { at, event } of events) {
    for (const sound of soundsFor(event)) {
      const when = at + sound.delayMs
      queued.push({ at: when, cancel: playCue({ ...sound, delayMs: when - now }) })
    }
  }
  p.state = state
  p.until = target
  queued = queued.filter((q) => q.at > now - 10_000)
}

/**
 * Whether sounds for events up to `now` were already queued and played by
 * the audio clock. Call before handling a tick's events.
 */
export function coversUntil(now: number): boolean {
  if (!plan || !audioManager.running) return false
  if (Math.abs(audioManager.clockOffsetMs(now) - plan.offsetMs) > LOST_MS) return false
  return plan.until >= now
}

/** Keep the queue in line with the engine. Call after every tick. */
export function sync(state: EngineState, settings: TimerSettings, now: number): void {
  if (state.status !== 'running') {
    // A finished workout keeps its last queued sound (the final bell).
    if (state.status !== 'finished') cancelFrom(now)
    plan = null
    audioManager.setKeepAlive(false)
    return
  }
  audioManager.setKeepAlive(true)
  if (!audioManager.running) {
    cancelFrom(now)
    plan = null
    return
  }
  const offsetMs = audioManager.clockOffsetMs(now)
  // Re-anchor on the real engine state if the clock drifted or ticks stalled
  // past the end of the queue; sounds already due stay where they are.
  if (plan && (Math.abs(offsetMs - plan.offsetMs) > RESYNC_MS || plan.until < now)) {
    cancelFrom(now)
    plan = null
  }
  plan ??= { state, settings, until: now, offsetMs }
  if (plan.until - now < REFILL_BELOW_MS) extend(plan, now)
}

/**
 * Requeue from scratch after the engine changed outside of ticks (start,
 * pause, skip, +30s, reset) or the sound settings changed. Sounds already
 * ringing are left alone.
 */
export function resync(state: EngineState, settings: TimerSettings, now: number): void {
  cancelFrom(now)
  plan = null
  sync(state, settings, now)
}
