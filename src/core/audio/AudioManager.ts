import { NO_SOUND, PRESET_SOUNDS } from './sounds'
import { listUserSounds } from '../../lib/userSounds'

/**
 * Plays cue sounds through the Web Audio API. Buffers are pre-decoded so cues
 * fire with near-zero latency, and (unlike <audio>) they keep playing on iOS
 * with the ring/silent switch off once the context is unlocked by a gesture.
 */
class AudioManager {
  private ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loading: Promise<void> | null = null

  /** Must be called from a user gesture (the start button) before any cue. */
  async unlock(): Promise<void> {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // Will retry on the next gesture.
      }
    }
    // Silent tick fully unlocks playback on iOS.
    const src = this.ctx.createBufferSource()
    src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate)
    src.connect(this.ctx.destination)
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
    this.ctx ??= new AudioContext()
    const buffer = await this.ctx.decodeAudioData(data)
    this.buffers.set(id, buffer)
  }

  /** Validates that a file is decodable audio without registering it. */
  async canDecode(data: ArrayBuffer): Promise<boolean> {
    this.ctx ??= new AudioContext()
    try {
      await this.ctx.decodeAudioData(data)
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
