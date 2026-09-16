import i18n from '../../i18n'
import { audioManager } from '../../core/audio/AudioManager'
import type { EngineEvent, EngineState } from '../../core/timer/types'
import { useConfigStore, type CueId } from '../../stores/configStore'
import { speak } from '../../lib/tts'
import { vibrate } from '../../lib/vibration'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts) as string

export interface CueSound {
  cue: CueId
  delayMs: number
}

/** The sounds an engine event makes, relative to the moment it fires. */
export function soundsFor(event: EngineEvent): CueSound[] {
  switch (event.type) {
    case 'phaseStart': {
      const { kind } = event.segment
      // Rest starting means the round just ended.
      const cue = kind === 'warmup' ? 'countdown' : kind === 'round' ? 'roundStart' : 'roundEnd'
      return [{ cue, delayMs: 0 }]
    }
    case 'warning':
      return [{ cue: event.segment.kind === 'round' ? 'roundWarn' : 'restWarn', delayMs: 0 }]
    case 'countdown':
      return [{ cue: 'countdown', delayMs: 0 }]
    case 'cycleSwitch':
      // Two quick cues = go hard, one = ease off; audible without looking.
      return event.mode === 'work'
        ? [{ cue: 'interval', delayMs: 0 }, { cue: 'interval', delayMs: 180 }]
        : [{ cue: 'interval', delayMs: 0 }]
    case 'finished':
      return [{ cue: 'finish', delayMs: 0 }]
  }
}

/** Plays a cue sound `delayMs` from now; returns a cancel function. */
export function playCue({ cue, delayMs }: CueSound): () => void {
  const choice = useConfigStore.getState().sounds[cue]
  return audioManager.play(choice.id, choice.volume, delayMs)
}

function announce(text: string) {
  const { tts, ttsVoice } = useConfigStore.getState()
  if (tts) speak(text, i18n.language, ttsVoice)
}

function buzz(pattern: number | number[]) {
  if (useConfigStore.getState().vibrate) vibrate(pattern)
}

/**
 * Turns engine events into voice / haptic cues, and into sounds unless the
 * cue scheduler already queued them on the audio clock.
 */
export function handleEngineEvents(events: EngineEvent[], state: EngineState, playSounds: boolean): void {
  const totalRounds = state.segments.filter((s) => s.kind === 'round').length

  for (const event of events) {
    if (playSounds) soundsFor(event).forEach(playCue)
    switch (event.type) {
      case 'phaseStart': {
        const { segment } = event
        if (segment.kind === 'warmup') {
          announce(t('tts.getReady'))
        } else if (segment.kind === 'round') {
          buzz(300)
          announce(
            segment.round === totalRounds && totalRounds > 1
              ? t('tts.lastRound')
              : t('tts.round', { n: segment.round }),
          )
        } else {
          buzz([200, 100, 200])
          announce(t('tts.rest'))
        }
        break
      }
      case 'warning': {
        const isRound = event.segment.kind === 'round'
        buzz([150, 80, 150])
        announce(isRound ? t('tts.warning', { s: warnSecFor(isRound) }) : t('tts.getReady'))
        break
      }
      case 'countdown':
        break
      case 'cycleSwitch':
        buzz(event.mode === 'work' ? [120, 60, 120] : 120)
        announce(t(event.mode === 'work' ? 'tts.work' : 'tts.ease'))
        break
      case 'finished':
        buzz([400, 150, 400, 150, 600])
        announce(t('tts.finished'))
        break
    }
  }
}

function warnSecFor(isRound: boolean): number {
  const c = useConfigStore.getState()
  return isRound ? c.roundWarnSec : c.restWarnSec
}
