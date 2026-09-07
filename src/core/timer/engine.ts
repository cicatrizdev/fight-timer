import type { EngineEvent, EngineState, Segment, TimerSettings } from './types'

const NO_COUNTDOWN = 4

export function buildSegments(s: TimerSettings): Segment[] {
  const segments: Segment[] = []
  if (s.warmupSec > 0) segments.push({ kind: 'warmup', round: 0, durationMs: s.warmupSec * 1000 })
  let round = 0
  const blocks = s.blocks.filter((b) => b.rounds > 0 && b.roundSec > 0)
  blocks.forEach((block, bi) => {
    for (let r = 1; r <= block.rounds; r++) {
      round++
      const cycle =
        block.cycle && block.cycle.workSec > 0 && block.cycle.easeSec > 0 ? block.cycle : undefined
      segments.push({ kind: 'round', round, durationMs: block.roundSec * 1000, cycle })
      const isLastOfBlock = r === block.rounds
      const isLastBlock = bi === blocks.length - 1
      if ((!isLastOfBlock || !isLastBlock) && block.restSec > 0) {
        segments.push({ kind: 'rest', round, durationMs: block.restSec * 1000 })
      }
    }
  })
  return segments
}

export function totalWorkoutSec(s: TimerSettings): number {
  return buildSegments(s).reduce((sum, seg) => sum + seg.durationMs, 0) / 1000
}

export function createIdleState(settings: TimerSettings): EngineState {
  const segments = buildSegments(settings)
  return {
    status: 'idle',
    segments,
    index: 0,
    phaseEndsAt: 0,
    remainingMs: segments[0]?.durationMs ?? 0,
    warned: false,
    lastCountdown: NO_COUNTDOWN,
    cycleIndex: 0,
    startedAt: 0,
    finishedAt: 0,
  }
}

export function currentSegment(state: EngineState): Segment | undefined {
  return state.segments[state.index]
}

function warnSecFor(segment: Segment, settings: TimerSettings): number {
  if (segment.kind === 'round') return settings.roundWarnSec
  if (segment.kind === 'rest') return settings.restWarnSec
  return 0
}

function enterSegment(state: EngineState, index: number, now: number): EngineState {
  const segment = state.segments[index]
  return {
    ...state,
    status: 'running',
    index,
    phaseEndsAt: now + segment.durationMs,
    remainingMs: segment.durationMs,
    warned: false,
    lastCountdown: NO_COUNTDOWN,
    cycleIndex: 0,
  }
}

export function start(settings: TimerSettings, now: number): { state: EngineState; events: EngineEvent[] } {
  const idle = createIdleState(settings)
  if (idle.segments.length === 0) {
    return { state: { ...idle, status: 'finished', startedAt: now, finishedAt: now }, events: [{ type: 'finished' }] }
  }
  const state = { ...enterSegment(idle, 0, now), startedAt: now }
  return { state, events: [{ type: 'phaseStart', segment: state.segments[0] }] }
}

export function pause(state: EngineState, now: number): EngineState {
  if (state.status !== 'running') return state
  return { ...state, status: 'paused', remainingMs: Math.max(0, state.phaseEndsAt - now) }
}

export function resume(state: EngineState, now: number): EngineState {
  if (state.status !== 'paused') return state
  return { ...state, status: 'running', phaseEndsAt: now + state.remainingMs }
}

export function extend(state: EngineState, ms: number): EngineState {
  if (state.status === 'running') return { ...state, phaseEndsAt: state.phaseEndsAt + ms, warned: false, lastCountdown: NO_COUNTDOWN }
  if (state.status === 'paused') return { ...state, remainingMs: state.remainingMs + ms, warned: false, lastCountdown: NO_COUNTDOWN }
  return state
}

export function skip(state: EngineState, now: number): { state: EngineState; events: EngineEvent[] } {
  if (state.status !== 'running' && state.status !== 'paused') return { state, events: [] }
  const next = state.index + 1
  if (next >= state.segments.length) {
    return {
      state: { ...state, status: 'finished', remainingMs: 0, finishedAt: now },
      events: [{ type: 'finished' }],
    }
  }
  const wasPaused = state.status === 'paused'
  let s = enterSegment(state, next, now)
  if (wasPaused) s = pause(s, now)
  return { state: s, events: [{ type: 'phaseStart', segment: s.segments[next] }] }
}

function halfCycleIndex(segment: Segment, elapsedMs: number): number {
  const { workSec, easeSec } = segment.cycle!
  const period = (workSec + easeSec) * 1000
  const inPeriod = elapsedMs % period
  return Math.floor(elapsedMs / period) * 2 + (inPeriod >= workSec * 1000 ? 1 : 0)
}

/**
 * Advance the engine to wall-clock `now`. Handles arbitrarily large gaps
 * (background tab, screen off) by walking through as many segments as needed.
 */
export function tick(
  state: EngineState,
  settings: TimerSettings,
  now: number,
): { state: EngineState; events: EngineEvent[] } {
  if (state.status !== 'running') return { state, events: [] }

  const events: EngineEvent[] = []
  let s = state

  // Cross segment boundaries, possibly several at once after a long sleep.
  while (s.phaseEndsAt <= now) {
    const boundary = s.phaseEndsAt
    const next = s.index + 1
    if (next >= s.segments.length) {
      events.push({ type: 'finished' })
      return { state: { ...s, status: 'finished', remainingMs: 0, finishedAt: boundary }, events }
    }
    s = enterSegment(s, next, boundary)
    events.push({ type: 'phaseStart', segment: s.segments[next] })
  }

  const remainingMs = s.phaseEndsAt - now
  const segment = s.segments[s.index]

  if (segment.cycle) {
    const idx = halfCycleIndex(segment, segment.durationMs - remainingMs)
    if (idx !== s.cycleIndex) {
      s = { ...s, cycleIndex: idx }
      // Announce only the latest switch, even if several were slept through.
      events.push({ type: 'cycleSwitch', mode: idx % 2 === 0 ? 'work' : 'ease' })
    }
  }

  const warnSec = warnSecFor(segment, settings)
  // Only warn if the warning window is meaningful for this segment length.
  if (!s.warned && warnSec > 0 && warnSec * 1000 < segment.durationMs && remainingMs <= warnSec * 1000) {
    s = { ...s, warned: true }
    events.push({ type: 'warning', segment })
  }

  if (settings.countdownBeeps) {
    const sec = Math.ceil(remainingMs / 1000)
    if (sec <= 3 && sec >= 1 && sec < s.lastCountdown) {
      s = { ...s, lastCountdown: sec }
      events.push({ type: 'countdown', secondsLeft: sec })
    }
  }

  return { state: { ...s, remainingMs }, events }
}
