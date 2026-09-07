import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { audioManager } from '../../core/audio/AudioManager'
import { formatSeconds } from '../../lib/format'
import { useInstallPrompt } from '../../lib/useInstallPrompt'
import { listUserSounds, type UserSound } from '../../lib/userSounds'
import { totalWorkoutSec } from '../../core/timer/engine'
import { MODALITY_PRESETS, useConfigStore, type CueId, type TimingConfig } from '../../stores/configStore'
import { toTimerSettings, useTimerStore } from '../../stores/timerStore'
import { SoundPickerRow } from '../sounds/SoundPickerRow'
import { UserSoundManager } from '../sounds/UserSoundManager'
import { BlockEditor } from './BlockEditor'
import { DurationField, Toggle } from './fields'
import { VoicePicker } from './VoicePicker'

const CUES: CueId[] = ['roundStart', 'roundEnd', 'roundWarn', 'restWarn', 'finish', 'countdown']

export function SettingsScreen() {
  const { t } = useTranslation()
  const config = useConfigStore()
  const startWorkout = useTimerStore((s) => s.startWorkout)
  const { canInstall, promptInstall, showIOSHint } = useInstallPrompt()
  const [userSounds, setUserSounds] = useState<UserSound[]>([])

  const reloadUserSounds = () => {
    listUserSounds().then(setUserSounds).catch(() => setUserSounds([]))
  }
  useEffect(reloadUserSounds, [])

  const onStart = () => {
    // Unlock inside the tap gesture, then start — cues need an unlocked context.
    void audioManager.unlock().then(startWorkout)
  }

  const savePreset = () => {
    const name = window.prompt(t('settings.presetNamePrompt'))?.trim()
    if (name) config.saveUserPreset(name)
  }

  const totalRounds = config.blocks.reduce((sum, b) => sum + b.rounds, 0)
  const totalSec = totalWorkoutSec(toTimerSettings(config))

  const timingMatches = (p: TimingConfig) =>
    p.warmupSec === config.warmupSec &&
    p.roundWarnSec === config.roundWarnSec &&
    p.restWarnSec === config.restWarnSec &&
    p.blocks.length === config.blocks.length &&
    p.blocks.every((b, i) => {
      const c = config.blocks[i]
      return (
        b.rounds === c.rounds &&
        b.roundSec === c.roundSec &&
        b.restSec === c.restSec &&
        b.cycleEnabled === c.cycleEnabled &&
        (!b.cycleEnabled || (b.workSec === c.workSec && b.easeSec === c.easeSec))
      )
    })

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="logo" aria-label={t('app.name')}>
          <svg className="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
            <g fill="#e63946" transform="translate(-4 0)">
              <rect x="12" y="8" width="38" height="34" rx="17" />
              <circle cx="14" cy="32" r="9" />
              <rect x="25" y="46" width="22" height="10" rx="4" />
            </g>
            <g fill="var(--accent)">
              <rect x="52" y="13" width="8" height="4" rx="2" />
              <rect x="54" y="23" width="8" height="4" rx="2" />
              <rect x="52" y="33" width="8" height="4" rx="2" />
            </g>
          </svg>
          <span className="logo__text">
            <span className="logo__word">
              FIGHT<em>TIMER</em>
            </span>
            <span className="logo__tagline">{t('app.tagline')}</span>
          </span>
        </h1>
        {canInstall && (
          <button type="button" className="btn btn--ghost" onClick={() => void promptInstall()}>
            {t('app.install')}
          </button>
        )}
      </header>

      <section className="card">
        <h2 className="card__title">{t('settings.presets')}</h2>
        <div className="chips">
          {MODALITY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${timingMatches(p) ? ' chip--active' : ''}`}
              onClick={() => config.applyTiming(p)}
            >
              {t(`settings.presetNames.${p.nameKey}`)}
            </button>
          ))}
          {config.userPresets.map((p) => (
            <span key={p.id} className={`chip chip--user${timingMatches(p) ? ' chip--active' : ''}`}>
              <button type="button" className="chip__apply" onClick={() => config.applyTiming(p)}>
                {p.name}
              </button>
              <button
                type="button"
                className="chip__delete"
                aria-label={`${t('settings.deletePreset')}: ${p.name}`}
                onClick={() => {
                  if (window.confirm(`${t('settings.deletePreset')}: ${p.name}?`)) config.deleteUserPreset(p.id)
                }}
              >
                ✕
              </button>
            </span>
          ))}
          <button type="button" className="chip chip--save" onClick={savePreset}>
            ＋ {t('settings.savePreset')}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">{t('settings.blocksTitle')}</h2>
        {config.blocks.map((b, i) => (
          <BlockEditor key={b.id} block={b} index={i} removable={config.blocks.length > 1} />
        ))}
        <button type="button" className="btn btn--ghost" onClick={config.addBlock}>
          ＋ {t('settings.addBlock')}
        </button>
      </section>

      <section className="card">
        <h2 className="card__title">{t('settings.timing')}</h2>
        <DurationField
          label={t('settings.warmup')}
          value={config.warmupSec}
          step={15}
          onChange={(v) => config.set({ warmupSec: v })}
        />
        <DurationField
          label={t('settings.roundWarn')}
          value={config.roundWarnSec}
          step={5}
          onChange={(v) => config.set({ roundWarnSec: v })}
        />
        <DurationField
          label={t('settings.restWarn')}
          value={config.restWarnSec}
          step={5}
          onChange={(v) => config.set({ restWarnSec: v })}
        />
      </section>

      <details className="card card--collapsible">
        <summary className="card__title card__summary">{t('settings.soundsTitle')}</summary>
        {CUES.map((cue) => (
          <SoundPickerRow key={cue} cue={cue} userSounds={userSounds} />
        ))}
        <UserSoundManager userSounds={userSounds} onChanged={reloadUserSounds} />
      </details>

      <section className="card">
        <h2 className="card__title">{t('settings.options')}</h2>
        <Toggle
          label={t('settings.countdownBeeps')}
          checked={config.countdownBeeps}
          onChange={(v) => config.set({ countdownBeeps: v })}
        />
        <Toggle label={t('settings.tts')} checked={config.tts} onChange={(v) => config.set({ tts: v })} />
        {config.tts && <VoicePicker />}
        <Toggle label={t('settings.vibrate')} checked={config.vibrate} onChange={(v) => config.set({ vibrate: v })} />
      </section>

      {showIOSHint && <p className="settings__ios-hint">{t('app.iosInstallHint')}</p>}

      <footer className="settings__footer">
        <span>
          {t('app.madeBy')}{' '}
          <a href="https://cicatriz.dev" target="_blank" rel="noreferrer">
            Cicatriz
          </a>
        </span>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/cicatrizdev/fight-timer" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>

      <div className="settings__start-bar">
        <p className="settings__summary">
          {totalRounds} rounds · {t('settings.totalTime', { total: formatSeconds(totalSec) })}
        </p>
        <button type="button" className="btn btn--start" onClick={onStart}>
          {t('settings.start')}
        </button>
      </div>
    </div>
  )
}
