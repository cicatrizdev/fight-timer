import i18n from '../../i18n'
import { audioManager } from '../../core/audio/AudioManager'
import type { EngineEvent, EngineState } from '../../core/timer/types'
import { useConfigStore, type CueId } from '../../stores/configStore'
import { speak } from '../../lib/tts'
import { vibrate } from '../../lib/vibration'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts) as string

function playCue(cue: CueId) {
  const { sounds } = useConfigStore.getState()
  const choice = sounds[cue]
  audioManager.play(choice.id, choice.volume)
}

function announce(text: string) {
  const { tts, ttsVoice } = useConfigStore.getState()
  if (tts) speak(text, i18n.language, ttsVoice)
}

function buzz(pattern: number | number[]) {
  if (useConfigStore.getState().vibrate) vibrate(pattern)
}

/** Turns engine events into sound / voice / haptic cues. */
export function handleEngineEvents(events: EngineEvent[], state: EngineState): void {
  const totalRounds = state.segments.filter((s) => s.kind === 'round').length

  for (const event of events) {
    switch (event.type) {
      case 'phaseStart': {
        const { segment } = event
        if (segment.kind === 'warmup') {
          playCue('countdown')
          announce(t('tts.getReady'))
        } else if (segment.kind === 'round') {
          playCue('roundStart')
          buzz(300)
          announce(
            segment.round === totalRounds && totalRounds > 1
              ? t('tts.lastRound')
              : t('tts.round', { n: segment.round }),
          )
        } else {
          // Rest starting means the round just ended.
          playCue('roundEnd')
          buzz([200, 100, 200])
          announce(t('tts.rest'))
        }
        break
      }
      case 'warning': {
        const isRound = event.segment.kind === 'round'
        playCue(isRound ? 'roundWarn' : 'restWarn')
        buzz([150, 80, 150])
        announce(isRound ? t('tts.warning', { s: warnSecFor(state, true) }) : t('tts.getReady'))
        break
      }
      case 'countdown':
        playCue('countdown')
        break
      case 'cycleSwitch':
        // Two quick cues = go hard, one = ease off; audible without looking.
        playCue('interval')
        if (event.mode === 'work') setTimeout(() => playCue('interval'), 180)
        buzz(event.mode === 'work' ? [120, 60, 120] : 120)
        announce(t(event.mode === 'work' ? 'tts.work' : 'tts.ease'))
        break
      case 'finished':
        playCue('finish')
        buzz([400, 150, 400, 150, 600])
        announce(t('tts.finished'))
        break
    }
  }
}

function warnSecFor(_state: EngineState, isRound: boolean): number {
  const c = useConfigStore.getState()
  return isRound ? c.roundWarnSec : c.restWarnSec
}
