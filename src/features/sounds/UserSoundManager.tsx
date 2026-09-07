import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { audioManager } from '../../core/audio/AudioManager'
import { NO_SOUND } from '../../core/audio/sounds'
import { deleteUserSound, saveUserSound, type UserSound } from '../../lib/userSounds'
import { useConfigStore } from '../../stores/configStore'

const MAX_BYTES = 1024 * 1024

interface Props {
  userSounds: UserSound[]
  onChanged: () => void
}

export function UserSoundManager({ userSounds, onChanged }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError(t('settings.uploadTooBig'))
      return
    }
    const data = await file.arrayBuffer()
    // decodeAudioData detaches the buffer, so validate on a copy.
    if (!(await audioManager.canDecode(data.slice(0)))) {
      setError(t('settings.uploadInvalid'))
      return
    }
    const name = file.name.replace(/\.[^.]+$/, '')
    const sound = await saveUserSound(name, file)
    await audioManager.decodeInto(sound.id, data)
    onChanged()
  }

  const remove = async (sound: UserSound) => {
    await deleteUserSound(sound.id)
    audioManager.drop(sound.id)
    // Any cue pointing at the removed sound falls back to silence.
    const { sounds, setCueSound } = useConfigStore.getState()
    for (const [cue, choice] of Object.entries(sounds)) {
      if (choice.id === sound.id) setCueSound(cue as keyof typeof sounds, { id: NO_SOUND })
    }
    onChanged()
  }

  return (
    <div className="user-sounds">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
          e.target.value = ''
        }}
      />
      <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
        ＋ {t('settings.uploadSound')}
      </button>
      {error && <p className="user-sounds__error">{error}</p>}
      {userSounds.length > 0 && (
        <ul className="user-sounds__list">
          {userSounds.map((s) => (
            <li key={s.id}>
              <span>{s.name}</span>
              <button
                type="button"
                className="user-sounds__delete"
                aria-label={t('settings.deleteSound')}
                onClick={() => void remove(s)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
