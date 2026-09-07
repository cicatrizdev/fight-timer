import { NO_SOUND, PRESET_SOUNDS } from './sounds'
import { listUserSounds } from '../../lib/userSounds'

// W3C Audio Session API (Safari/WebKit): "transient" makes our short cues mix
// with background music instead of pausing it. Trade-off on iOS: mixed audio
// respects the ring/silent switch. Browsers without the API keep the default.
type AudioSessionLike = { type: string }

function requestMixedAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
  if (!session) return
  try {
    session.type = 'transient'
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

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      requestMixedAudioSession()
      this.ctx = new AudioContext()
    }
    return this.ctx
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

  play(id: string, volume: number): void {
    if (id === NO_SOUND || !this.ctx) return
    const buffer = this.buffers.get(id)
    if (!buffer) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, volume))
    src.connect(gain)
    gain.connect(this.ctx.destination)
    src.start()
  }
}

export const audioManager = new AudioManager()
