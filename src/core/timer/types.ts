export type SegmentKind = 'warmup' | 'round' | 'rest'

export interface CycleSpec {
  /** "Hard" seconds at the start of each cycle. */
  workSec: number
  /** "Easy" seconds after the work part. */
  easeSec: number
}

export interface Segment {
  kind: SegmentKind
  /** 1-based round number this segment belongs to (0 for warmup). */
  round: number
  durationMs: number
  /** Intra-round work/ease cycling (round segments only). */
  cycle?: CycleSpec
}

export interface BlockSettings {
  rounds: number
  roundSec: number
  /** Rest between rounds (also used between this block and the next). */
  restSec: number
  cycle?: CycleSpec
}

export interface TimerSettings {
  warmupSec: number
  /** Seconds before the end of a round to fire the warning cue (0 = off). */
  roundWarnSec: number
  /** Seconds before the end of a rest to fire the warning cue (0 = off). */
  restWarnSec: number
  /** Beep on the last 3 seconds of every segment. */
  countdownBeeps: boolean
  /** Round blocks, in order; each may have its own round/rest durations. */
  blocks: BlockSettings[]
}

export type CycleMode = 'work' | 'ease'

export type EngineEvent =
  | { type: 'phaseStart'; segment: Segment }
  | { type: 'warning'; segment: Segment }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'cycleSwitch'; mode: CycleMode }
  | { type: 'finished' }

export type EngineStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface EngineState {
  status: EngineStatus
  segments: Segment[]
  /** Index into segments; only meaningful while running/paused. */
  index: number
  /** Absolute epoch-ms when the current segment ends (running only). */
  phaseEndsAt: number
  /** Remaining ms in the current segment; authoritative while paused. */
  remainingMs: number
  /** Whether the warning cue already fired for the current segment. */
  warned: boolean
  /** Last whole second a countdown beep fired for (4 = none yet). */
  lastCountdown: number
  /** Index of the half-cycle (work/ease) already announced (-1 = none). */
  cycleIndex: number
  /** Epoch-ms when the workout was started (for the end-of-workout summary). */
  startedAt: number
  /** Epoch-ms when the workout finished (0 until then). */
  finishedAt: number
}

/** Current work/ease mode for a position inside a cycling segment. */
export function cycleModeAt(cycle: CycleSpec, elapsedMs: number): CycleMode {
  const period = (cycle.workSec + cycle.easeSec) * 1000
  return elapsedMs % period < cycle.workSec * 1000 ? 'work' : 'ease'
}

/** Ms remaining in the current work/ease half-cycle. */
export function cycleRemainingMs(cycle: CycleSpec, elapsedMs: number): number {
  const period = (cycle.workSec + cycle.easeSec) * 1000
  const inPeriod = elapsedMs % period
  const workMs = cycle.workSec * 1000
  return inPeriod < workMs ? workMs - inPeriod : period - inPeriod
}
