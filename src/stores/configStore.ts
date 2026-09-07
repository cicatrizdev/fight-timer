import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SoundChoice {
  id: string
  volume: number
}

export type CueId =
  | 'roundStart'
  | 'roundEnd'
  | 'roundWarn'
  | 'restWarn'
  | 'finish'
  | 'countdown'
  | 'interval'

export type CueSounds = Record<CueId, SoundChoice>

export interface BlockConfig {
  id: string
  rounds: number
  roundSec: number
  restSec: number
  /** Intra-round work/ease intervals (e.g. 30s hard / 15s light). */
  cycleEnabled: boolean
  workSec: number
  easeSec: number
}

export interface TimingConfig {
  warmupSec: number
  roundWarnSec: number
  restWarnSec: number
  blocks: BlockConfig[]
}

export interface UserPreset extends TimingConfig {
  id: string
  name: string
}

export interface ModalityPreset extends TimingConfig {
  id: string
  nameKey: string
  /** Cue sounds this modality ships with; applied together with the timing. */
  sounds?: Partial<CueSounds>
}

export function makeBlock(patch: Partial<BlockConfig> = {}): BlockConfig {
  return {
    id: crypto.randomUUID(),
    rounds: 3,
    roundSec: 180,
    restSec: 60,
    cycleEnabled: false,
    workSec: 30,
    easeSec: 15,
    ...patch,
  }
}

export const DEFAULT_CUE_SOUNDS: CueSounds = {
  roundStart: { id: 'bell', volume: 1 },
  roundEnd: { id: 'bell', volume: 1 },
  roundWarn: { id: 'clacker', volume: 1 },
  restWarn: { id: 'beep', volume: 0.9 },
  finish: { id: 'bell-end', volume: 1 },
  countdown: { id: 'beep', volume: 0.7 },
  interval: { id: 'beep', volume: 0.9 },
}

const preset = (id: string, rounds: number, roundSec: number, restSec: number, extra: Partial<ModalityPreset> = {}): ModalityPreset => ({
  id,
  nameKey: id,
  warmupSec: 60,
  roundWarnSec: 10,
  restWarnSec: 0,
  blocks: [makeBlock({ rounds, roundSec, restSec })],
  // Ring sports ship with the bell kit; presets with their own kit override.
  sounds: DEFAULT_CUE_SOUNDS,
  ...extra,
})

export const MODALITY_PRESETS: ModalityPreset[] = [
  preset('boxing', 12, 180, 60),
  preset('mma', 5, 300, 60),
  preset('muaythai', 5, 180, 120),
  preset('bjj', 6, 300, 60, {
    // Mat kit: referee whistle starts the round; the rest follows the
    // standard bell kit.
    sounds: {
      ...DEFAULT_CUE_SOUNDS,
      roundStart: { id: 'whistle', volume: 1 },
      roundWarn: { id: 'beep', volume: 0.9 },
    },
  }),
  preset('hiit', 8, 40, 20, { warmupSec: 30, roundWarnSec: 5 }),
]

export interface ConfigState extends TimingConfig {
  countdownBeeps: boolean
  tts: boolean
  /** Specific speechSynthesis voice name; null = automatic best match. */
  ttsVoice: string | null
  vibrate: boolean
  sounds: CueSounds
  userPresets: UserPreset[]
  set: (patch: Partial<ConfigState>) => void
  setCueSound: (cue: CueId, patch: Partial<SoundChoice>) => void
  updateBlock: (id: string, patch: Partial<BlockConfig>) => void
  addBlock: () => void
  removeBlock: (id: string) => void
  applyTiming: (timing: TimingConfig & { sounds?: Partial<CueSounds> }) => void
  saveUserPreset: (name: string) => void
  deleteUserPreset: (id: string) => void
}

const copyTiming = (s: TimingConfig): TimingConfig => ({
  warmupSec: s.warmupSec,
  roundWarnSec: s.roundWarnSec,
  restWarnSec: s.restWarnSec,
  blocks: s.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
})

interface LegacyTiming {
  rounds?: number
  roundSec?: number
  restSec?: number
}

function legacyToBlocks(state: LegacyTiming): BlockConfig[] {
  return [
    makeBlock({
      rounds: state.rounds ?? 5,
      roundSec: state.roundSec ?? 180,
      restSec: state.restSec ?? 60,
    }),
  ]
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      warmupSec: 60,
      roundWarnSec: 10,
      restWarnSec: 0,
      blocks: [makeBlock({ rounds: 5 })],
      countdownBeeps: false,
      tts: false,
      ttsVoice: null,
      vibrate: true,
      sounds: DEFAULT_CUE_SOUNDS,
      userPresets: [],
      set: (patch) => set(patch),
      setCueSound: (cue, patch) =>
        set((s) => ({ sounds: { ...s.sounds, [cue]: { ...s.sounds[cue], ...patch } } })),
      updateBlock: (id, patch) =>
        set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
      addBlock: () => set((s) => ({ blocks: [...s.blocks, makeBlock()] })),
      removeBlock: (id) =>
        set((s) => (s.blocks.length > 1 ? { blocks: s.blocks.filter((b) => b.id !== id) } : s)),
      applyTiming: (timing) =>
        set((s) => ({
          ...copyTiming(timing),
          ...(timing.sounds ? { sounds: { ...s.sounds, ...timing.sounds } } : {}),
        })),
      saveUserPreset: (name) =>
        set((s) => ({
          userPresets: [...s.userPresets, { id: crypto.randomUUID(), name, ...copyTiming(get()) }],
        })),
      deleteUserPreset: (id) =>
        set((s) => ({ userPresets: s.userPresets.filter((p) => p.id !== id) })),
    }),
    {
      name: 'fight-timer-config',
      version: 4,
      // v2: rest-end warning and countdown beeps became opt-in.
      // v3: voice announcements became opt-in, with a selectable voice.
      // v4: flat rounds/roundSec/restSec became a list of blocks; interval cue added.
      migrate: (persisted, version) => {
        const state = persisted as Partial<ConfigState> &
          LegacyTiming & { userPresets?: (UserPreset & Partial<Record<keyof LegacyTiming, number>>)[] }
        if (version < 2) {
          state.restWarnSec = 0
          state.countdownBeeps = false
        }
        if (version < 3) {
          state.tts = false
          state.ttsVoice = null
        }
        if (version < 4) {
          state.blocks = legacyToBlocks(state)
          state.userPresets = (state.userPresets ?? []).map((p) => ({
            ...p,
            blocks: legacyToBlocks(p as unknown as LegacyTiming),
          }))
          state.sounds = { ...DEFAULT_CUE_SOUNDS, ...state.sounds, interval: DEFAULT_CUE_SOUNDS.interval }
        }
        return state as ConfigState
      },
    },
  ),
)
