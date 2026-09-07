import { useTranslation } from 'react-i18next'
import { audioManager } from '../../core/audio/AudioManager'
import { NO_SOUND, PRESET_SOUNDS } from '../../core/audio/sounds'
import type { UserSound } from '../../lib/userSounds'
import { useConfigStore, type CueId } from '../../stores/configStore'

interface Props {
  cue: CueId
  userSounds: UserSound[]
}

export function SoundPickerRow({ cue, userSounds }: Props) {
  const { t } = useTranslation()
  const choice = useConfigStore((s) => s.sounds[cue])
  const setCueSound = useConfigStore((s) => s.setCueSound)

  const preview = () => {
    void audioManager.unlock().then(() => audioManager.play(choice.id, choice.volume))
  }

  return (
    <div className="sound-row">
      <span className="sound-row__label">{t(`settings.cue.${cue}`)}</span>
      <div className="sound-row__controls">
        <select
          className="sound-row__select"
          value={choice.id}
          onChange={(e) => setCueSound(cue, { id: e.target.value })}
        >
          {PRESET_SOUNDS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`settings.soundNames.${p.nameKey}`)}
            </option>
          ))}
          {userSounds.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NO_SOUND}>{t('settings.soundNames.none')}</option>
        </select>
        <input
          className="sound-row__volume"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={choice.volume}
          aria-label={t('settings.volume')}
          onChange={(e) => setCueSound(cue, { volume: Number(e.target.value) })}
        />
        <button
          type="button"
          className="sound-row__play"
          aria-label={t('settings.preview')}
          disabled={choice.id === NO_SOUND}
          onClick={preview}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
