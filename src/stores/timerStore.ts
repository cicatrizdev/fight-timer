import { create } from 'zustand'
import { createIdleState, extend, pause, resume, skip, start, tick } from '../core/timer/engine'
import type { EngineEvent, EngineState, TimerSettings } from '../core/timer/types'
import { useConfigStore, type ConfigState } from './configStore'
import { handleEngineEvents } from '../features/timer/cues'
import { keepScreenOn, releaseScreen } from '../lib/wakeLock'
import { audioManager } from '../core/audio/AudioManager'

export function toTimerSettings(c: Pick<ConfigState, 'warmupSec' | 'roundWarnSec' | 'restWarnSec' | 'countdownBeeps' | 'blocks'>): TimerSettings {
  return {
    warmupSec: c.warmupSec,
    roundWarnSec: c.roundWarnSec,
    restWarnSec: c.restWarnSec,
    countdownBeeps: c.countdownBeeps,
    blocks: c.blocks.map((b) => ({
      rounds: b.rounds,
      roundSec: b.roundSec,
      restSec: b.restSec,
      cycle: b.cycleEnabled ? { workSec: b.workSec, easeSec: b.easeSec } : undefined,
    })),
  }
}

const settingsFromConfig = () => toTimerSettings(useConfigStore.getState())

// ---- active-workout persistence (survives refresh / tab kill) ----

const ACTIVE_KEY = 'fight-timer-active'
const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1000

interface ActiveSnapshot {
  engine: EngineState
  settings: TimerSettings
  savedAt: number
}

function loadActive(): ActiveSnapshot | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as ActiveSnapshot
    if (snap.engine?.status !== 'running' && snap.engine?.status !== 'paused') return null
    if (!Array.isArray(snap.engine.segments) || snap.engine.segments.length === 0) return null
    if (Date.now() - snap.savedAt > MAX_RESUME_AGE_MS) return null
    return snap
  } catch {
    return null
  }
}

function saveActive(engine: EngineState, settings: TimerSettings): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ engine, settings, savedAt: Date.now() }))
  } catch {
    // Storage full/unavailable — resume-after-refresh just won't work.
  }
}

function clearActive(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
}

// ---- store ----

interface TimerStore {
  engine: EngineState
  /** Settings snapshot taken when the workout started. */
  settings: TimerSettings
  startWorkout: () => void
  togglePause: () => void
  reset: () => void
  skipPhase: () => void
  addThirtySeconds: () => void
  _tick: () => void
}

let worker: Worker | undefined

function setWorkerRunning(running: boolean) {
  if (running) {
    if (!worker) {
      worker = new Worker(new URL('../core/timer/tickWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = () => useTimerStore.getState()._tick()
    }
    worker.postMessage('start')
  } else {
    worker?.postMessage('stop')
  }
}

function afterEvents(state: EngineState, events: EngineEvent[]) {
  if (events.length > 0) handleEngineEvents(events, state)
  if (state.status === 'finished') {
    setWorkerRunning(false)
    releaseScreen()
  }
}

const restored = loadActive()

export const useTimerStore = create<TimerStore>()((set, get) => ({
  engine: restored?.engine ?? createIdleState(settingsFromConfig()),
  settings: restored?.settings ?? settingsFromConfig(),

  startWorkout: () => {
    const settings = settingsFromConfig()
    const { state, events } = start(settings, Date.now())
    set({ engine: state, settings })
    setWorkerRunning(true)
    keepScreenOn()
    afterEvents(state, events)
  },

  togglePause: () => {
    const { engine } = get()
    const now = Date.now()
    if (engine.status === 'running') {
      set({ engine: pause(engine, now) })
      setWorkerRunning(false)
      releaseScreen()
    } else if (engine.status === 'paused') {
      set({ engine: resume(engine, now) })
      setWorkerRunning(true)
      keepScreenOn()
    }
  },

  reset: () => {
    setWorkerRunning(false)
    releaseScreen()
    set({ engine: createIdleState(settingsFromConfig()) })
  },

  skipPhase: () => {
    const { engine } = get()
    const { state, events } = skip(engine, Date.now())
    set({ engine: state })
    afterEvents(state, events)
  },

  addThirtySeconds: () => {
    set((s) => ({ engine: extend(s.engine, 30_000) }))
  },

  _tick: () => {
    const { engine, settings } = get()
    if (engine.status !== 'running') return
    const { state, events } = tick(engine, settings, Date.now())
    set({ engine: state })
    afterEvents(state, events)
  },
}))

// Persist the active workout. Absolute timestamps make the snapshot cheap:
// while running it only changes on segment/pause/extend boundaries.
useTimerStore.subscribe((s, prev) => {
  const e = s.engine
  const p = prev.engine
  if (e.status === 'running' || e.status === 'paused') {
    const changed =
      e.status !== p.status ||
      e.index !== p.index ||
      e.phaseEndsAt !== p.phaseEndsAt ||
      (e.status === 'paused' && e.remainingMs !== p.remainingMs) ||
      e.startedAt !== p.startedAt
    if (changed) saveActive(e, s.settings)
  } else if (p.status === 'running' || p.status === 'paused') {
    clearActive()
  }
})

// Finish restoring a workout that was live when the page was closed: catch the
// engine up silently (no missed-cue barrage) and re-arm worker + wake lock.
if (restored) {
  if (restored.engine.status === 'running') {
    const { state } = tick(restored.engine, restored.settings, Date.now())
    useTimerStore.setState({ engine: state })
    if (state.status === 'running') {
      setWorkerRunning(true)
      keepScreenOn()
    } else {
      clearActive()
    }
  }
  // Audio needs a user gesture after a reload; unlock on the first touch.
  const unlockOnce = () => {
    void audioManager.unlock()
    document.removeEventListener('pointerdown', unlockOnce)
  }
  document.addEventListener('pointerdown', unlockOnce)
}

// Catch up immediately when the tab becomes visible again — worker ticks may
// have been delayed, and the UI should snap to the correct time instantly.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') useTimerStore.getState()._tick()
})
