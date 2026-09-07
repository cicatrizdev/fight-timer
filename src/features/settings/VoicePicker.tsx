import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { onVoicesChanged, speak, voicesForLang } from '../../lib/tts'
import { useConfigStore } from '../../stores/configStore'

export function VoicePicker() {
  const { t, i18n } = useTranslation()
  const ttsVoice = useConfigStore((s) => s.ttsVoice)
  const set = useConfigStore((s) => s.set)
  const [voices, setVoices] = useState(() => voicesForLang(i18n.language))

  useEffect(() => {
    const update = () => setVoices(voicesForLang(i18n.language))
    update()
    return onVoicesChanged(update)
  }, [i18n.language])

  const test = () => {
    speak(`${t('tts.round', { n: 1 })}. ${t('tts.getReady')}`, i18n.language, ttsVoice)
  }

  return (
    <div className="sound-row">
      <span className="sound-row__label">{t('settings.ttsVoice')}</span>
      <div className="sound-row__controls">
        <select
          className="sound-row__select"
          value={ttsVoice ?? ''}
          onChange={(e) => set({ ttsVoice: e.target.value || null })}
        >
          <option value="">{t('settings.ttsVoiceAuto')}</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
        <button type="button" className="sound-row__play" aria-label={t('settings.preview')} onClick={test}>
          ▶
        </button>
      </div>
    </div>
  )
}
