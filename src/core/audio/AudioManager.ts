import { NO_SOUND, PRESET_SOUNDS } from './sounds'
import { listUserSounds } from '../../lib/userSounds'

const BOOST_DRIVE = 5

// W3C Audio Session API (Safari/WebKit). iOS forces a choice the user makes
// in the settings: "transient" mixes cues with background music but obeys the
// ring/silent switch; "playback" sounds even on silent but may pause music.
// Browsers without the API keep the platform default (Android mixes anyway).
type AudioSessionLike = { type: string }

export function applyAudioSessionType(ignoreSilentSwitch: boolean): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
  if (!session) return
  try {
    session.type = ignoreSilentSwitch ? 'playback' : 'transient'
  } catch {
    // Unknown value or read-only — keep the platform default.
  }
}

/**
 * Plays cue sounds through the Web Audio API. Buffers are pre-decoded so cues
 * fire with near-zero latency, and (unlike <audio>) they keep playing on iOS
 * with the ring/silent switch off once the context is unlocked by a gesture.
 */
class AudioManager {
  private ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loading: Promise<void> | null = null
  /** Every cue goes through this bus so the loud-music boost applies to all. */
  private bus: GainNode | null = null
  private boostChain: AudioNode[] = []
  private boost = false
  private keepAliveSrc: ConstantSourceNode | null = null

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.bus = this.ctx.createGain()
      this.routeBus()
    }
    return this.ctx
  }

  /**
   * Boost = a tanh saturator: quiet parts get up to BOOST_DRIVE× gain while
   * peaks round off below full scale. Output can't exceed the phone's max
   * volume, so this raises perceived loudness by thickening the sound.
   */
  private routeBus(): void {
    const ctx = this.ctx
    if (!ctx || !this.bus) return
    this.bus.disconnect()
    for (const node of this.boostChain) node.disconnect()
    this.boostChain = []
    if (!this.boost) {
      this.bus.connect(ctx.destination)
      return
    }
    const shaper = ctx.createWaveShaper()
    shaper.curve = saturationCurve(BOOST_DRIVE)
    shaper.oversample = '4x'
    this.bus.connect(shaper).connect(ctx.destination)
    this.boostChain = [shaper]
  }

  setBoost(on: boolean): void {
    if (on === this.boost) return
    this.boost = on
    this.routeBus()
  }

  /** True once the context is unlocked and actually rendering. */
  get running(): boolean {
    return this.ctx?.state === 'running'
  }

  /** Audio clock minus wall clock, in ms; jumps when the context was suspended. */
  clockOffsetMs(wallNow: number): number {
    return (this.ctx?.currentTime ?? 0) * 1000 - wallNow
  }

  /**
   * An inaudible DC signal while a workout runs. Browsers treat a page that is
   * producing audio as "playing media" and don't freeze or heavily throttle it
   * in the background, so scheduled cues and ticks keep going.
   */
  setKeepAlive(on: boolean): void {
    const ctx = this.ctx
    if (on && !this.keepAliveSrc && ctx) {
      const src = ctx.createConstantSource()
      src.offset.value = 0.0001
      src.connect(ctx.destination)
      src.start()
      this.keepAliveSrc = src
    } else if (!on && this.keepAliveSrc) {
      this.keepAliveSrc.stop()
      this.keepAliveSrc.disconnect()
      this.keepAliveSrc = null
    }
  }

  /** Must be called from a user gesture (the start button) before any cue. */
  async unlock(): Promise<void> {
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // Will retry on the next gesture.
      }
    }
    // Silent tick fully unlocks playback on iOS.
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    src.connect(ctx.destination)
    src.start()
    await this.preloadAll()
  }

  async preloadAll(): Promise<void> {
    this.loading ??= this.doPreload()
    await this.loading
  }

  private async doPreload(): Promise<void> {
    await Promise.all([
      ...PRESET_SOUNDS.map(async (p) => {
        try {
          const res = await fetch(p.url)
          await this.decodeInto(p.id, await res.arrayBuffer())
        } catch {
          // Missing/undecodable preset: cue simply won't play.
        }
      }),
      (async () => {
        try {
          const sounds = await listUserSounds()
          await Promise.all(sounds.map(async (s) => this.decodeInto(s.id, await s.blob.arrayBuffer())))
        } catch {
          // IndexedDB unavailable (private mode) — presets still work.
        }
      })(),
    ])
  }

  /** Decode and register a buffer; used by preload and right after an upload. */
  async decodeInto(id: string, data: ArrayBuffer): Promise<void> {
    const buffer = await this.ensureCtx().decodeAudioData(data)
    this.buffers.set(id, buffer)
  }

  /** Validates that a file is decodable audio without registering it. */
  async canDecode(data: ArrayBuffer): Promise<boolean> {
    try {
      await this.ensureCtx().decodeAudioData(data)
      return true
    } catch {
      return false
    }
  }

  drop(id: string): void {
    this.buffers.delete(id)
  }

  /**
   * Play now, or `delayMs` from now on the audio clock. Scheduled sources
   * fire from the audio thread, on time even while page JS is throttled.
   * Returns a cancel function (no-op once played).
   */
  play(id: string, volume: number, delayMs = 0): () => void {
    const noop = () => {}
    if (id === NO_SOUND || !this.ctx || !this.bus) return noop
    const buffer = this.buffers.get(id)
    if (!buffer) return noop
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, volume))
    src.connect(gain)
    gain.connect(this.bus)
    src.start(this.ctx.currentTime + Math.max(0, delayMs) / 1000)
    return () => {
      try {
        src.stop()
      } catch {
        // Already stopped.
      }
      src.disconnect()
    }
  }
}

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 4096
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive)
  }
  return curve
}

export const audioManager = new AudioManager()
