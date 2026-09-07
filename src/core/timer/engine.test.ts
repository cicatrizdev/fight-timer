import { describe, expect, it } from 'vitest'
import { buildSegments, createIdleState, pause, resume, skip, start, tick, totalWorkoutSec } from './engine'
import type { TimerSettings } from './types'

const base: TimerSettings = {
  warmupSec: 10,
  roundWarnSec: 10,
  restWarnSec: 5,
  countdownBeeps: true,
  blocks: [{ rounds: 3, roundSec: 60, restSec: 30 }],
}

describe('buildSegments', () => {
  it('builds warmup + rounds with rests in between, no trailing rest', () => {
    const segs = buildSegments(base)
    expect(segs.map((s) => s.kind)).toEqual(['warmup', 'round', 'rest', 'round', 'rest', 'round'])
    expect(segs.map((s) => s.round)).toEqual([0, 1, 1, 2, 2, 3])
  })

  it('omits warmup and rest when zero', () => {
    const segs = buildSegments({ ...base, warmupSec: 0, blocks: [{ rounds: 3, roundSec: 60, restSec: 0 }] })
    expect(segs.map((s) => s.kind)).toEqual(['round', 'round', 'round'])
  })

  it('chains blocks with continuous round numbers and rest between blocks', () => {
    const segs = buildSegments({
      ...base,
      warmupSec: 0,
      blocks: [
        { rounds: 2, roundSec: 180, restSec: 60 },
        { rounds: 2, roundSec: 300, restSec: 90 },
      ],
    })
    expect(segs.map((s) => `${s.kind}${s.round}:${s.durationMs / 1000}`)).toEqual([
      'round1:180', 'rest1:60', 'round2:180', 'rest2:60', // rest after block 1's last round bridges into block 2
      'round3:300', 'rest3:90', 'round4:300',
    ])
  })

  it('drops empty blocks and invalid cycles', () => {
    const segs = buildSegments({
      ...base,
      warmupSec: 0,
      blocks: [
        { rounds: 0, roundSec: 60, restSec: 30 },
        { rounds: 1, roundSec: 60, restSec: 30, cycle: { workSec: 0, easeSec: 15 } },
      ],
    })
    expect(segs).toHaveLength(1)
    expect(segs[0].cycle).toBeUndefined()
  })

  it('computes the total workout duration', () => {
    expect(totalWorkoutSec(base)).toBe(10 + 3 * 60 + 2 * 30)
  })
})

describe('engine lifecycle', () => {
  it('starts in the first segment and emits phaseStart', () => {
    const { state, events } = start(base, 1000)
    expect(state.status).toBe('running')
    expect(events).toEqual([{ type: 'phaseStart', segment: state.segments[0] }])
    expect(state.phaseEndsAt).toBe(1000 + 10_000)
  })

  it('computes remaining time from timestamps', () => {
    const { state } = start(base, 0)
    const { state: s2 } = tick(state, base, 4000)
    expect(s2.remainingMs).toBe(6000)
  })

  it('crosses a segment boundary exactly once with phaseStart', () => {
    const { state } = start(base, 0)
    const { state: s2, events } = tick(state, base, 10_050)
    expect(s2.segments[s2.index].kind).toBe('round')
    expect(events.filter((e) => e.type === 'phaseStart')).toHaveLength(1)
    // Next segment end is anchored at the boundary, not at tick time — no drift.
    expect(s2.phaseEndsAt).toBe(10_000 + 60_000)
  })

  it('walks multiple segments after a long sleep', () => {
    const { state } = start(base, 0)
    // Sleep past warmup(10) + round(60) + rest(30) into round 2.
    const { state: s2, events } = tick(state, base, 101_000)
    expect(s2.segments[s2.index]).toMatchObject({ kind: 'round', round: 2 })
    expect(events.filter((e) => e.type === 'phaseStart')).toHaveLength(3)
    expect(s2.remainingMs).toBe(59_000)
  })

  it('finishes after the last round and emits finished', () => {
    const short: TimerSettings = { ...base, warmupSec: 0, blocks: [{ rounds: 1, roundSec: 5, restSec: 0 }] }
    const { state } = start(short, 0)
    const { state: s2, events } = tick(state, short, 5001)
    expect(s2.status).toBe('finished')
    expect(s2.finishedAt).toBe(5000)
    expect(events).toEqual([{ type: 'finished' }])
  })

  it('pause freezes remaining time and resume re-anchors it', () => {
    const { state } = start(base, 0)
    const paused = pause(state, 4000)
    expect(paused.remainingMs).toBe(6000)
    const resumed = resume(paused, 50_000)
    expect(resumed.phaseEndsAt).toBe(56_000)
    const { state: s2 } = tick(resumed, base, 51_000)
    expect(s2.remainingMs).toBe(5000)
  })

  it('skip jumps to the next segment', () => {
    const { state } = start(base, 0)
    const { state: s2 } = tick(state, base, 1000)
    const { state: s3, events: ev } = skip(s2, 2000)
    expect(s3.segments[s3.index].kind).toBe('round')
    expect(ev[0].type).toBe('phaseStart')
    expect(s3.phaseEndsAt).toBe(2000 + 60_000)
  })
})

describe('cues', () => {
  it('fires the round warning once at the configured time', () => {
    const noWarmup = { ...base, warmupSec: 0 }
    const { state } = start(noWarmup, 0)
    const early = tick(state, noWarmup, 49_000)
    expect(early.events.find((e) => e.type === 'warning')).toBeUndefined()
    const atWarn = tick(early.state, noWarmup, 50_000)
    expect(atWarn.events).toContainEqual({ type: 'warning', segment: state.segments[0] })
    const later = tick(atWarn.state, noWarmup, 51_000)
    expect(later.events.find((e) => e.type === 'warning')).toBeUndefined()
  })

  it('uses the rest warning window for rest segments', () => {
    const noWarmup = { ...base, warmupSec: 0 }
    const { state } = start(noWarmup, 0)
    const inRest = tick(state, noWarmup, 61_000).state
    expect(inRest.segments[inRest.index].kind).toBe('rest')
    // rest ends at 90s, restWarnSec=5 → warning at 85s
    const before = tick(inRest, noWarmup, 84_000)
    expect(before.events.find((e) => e.type === 'warning')).toBeUndefined()
    const at = tick(before.state, noWarmup, 85_000)
    expect(at.events.find((e) => e.type === 'warning')).toBeDefined()
  })

  it('skips the warning when the window is not smaller than the segment', () => {
    const s: TimerSettings = {
      ...base,
      warmupSec: 0,
      roundWarnSec: 10,
      blocks: [{ rounds: 3, roundSec: 8, restSec: 30 }],
    }
    const { state } = start(s, 0)
    const { events } = tick(state, s, 1000)
    expect(events.find((e) => e.type === 'warning')).toBeUndefined()
  })

  it('beeps once per second in the last 3 seconds', () => {
    const noWarmup = { ...base, warmupSec: 0 }
    const { state } = start(noWarmup, 0)
    let s = state
    const beeps: number[] = []
    for (let t = 56_500; t < 60_000; t += 100) {
      const r = tick(s, noWarmup, t)
      s = r.state
      for (const e of r.events) if (e.type === 'countdown') beeps.push(e.secondsLeft)
    }
    expect(beeps).toEqual([3, 2, 1])
  })

  it('does not beep when disabled', () => {
    const s: TimerSettings = { ...base, warmupSec: 0, countdownBeeps: false }
    const { state } = start(s, 0)
    const { events } = tick(state, s, 58_000)
    expect(events.find((e) => e.type === 'countdown')).toBeUndefined()
  })
})

describe('intra-round cycles', () => {
  const cycled: TimerSettings = {
    warmupSec: 0,
    roundWarnSec: 0,
    restWarnSec: 0,
    countdownBeeps: false,
    blocks: [{ rounds: 1, roundSec: 90, restSec: 0, cycle: { workSec: 30, easeSec: 15 } }],
  }

  it('fires cycleSwitch at each work/ease boundary', () => {
    const { state } = start(cycled, 0)
    let s = state
    const switches: string[] = []
    for (let t = 1000; t < 90_000; t += 500) {
      const r = tick(s, cycled, t)
      s = r.state
      for (const e of r.events) if (e.type === 'cycleSwitch') switches.push(`${e.mode}@${t / 1000}`)
    }
    // 30s work / 15s ease: ease at 30, work at 45, ease at 75... round ends at 90.
    expect(switches).toEqual(['ease@30', 'work@45', 'ease@75'])
  })

  it('announces only the latest switch after a long sleep', () => {
    const { state } = start(cycled, 0)
    const { events } = tick(state, cycled, 46_000)
    const switches = events.filter((e) => e.type === 'cycleSwitch')
    expect(switches).toEqual([{ type: 'cycleSwitch', mode: 'work' }])
  })

  it('does not fire cycleSwitch for rounds without a cycle', () => {
    const { state } = start(base, 0)
    const { events } = tick(state, base, 40_000)
    expect(events.find((e) => e.type === 'cycleSwitch')).toBeUndefined()
  })
})

describe('createIdleState', () => {
  it('exposes the first segment duration as remaining', () => {
    const s = createIdleState(base)
    expect(s.status).toBe('idle')
    expect(s.remainingMs).toBe(10_000)
  })
})
