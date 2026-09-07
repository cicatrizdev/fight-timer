export const NO_SOUND = 'none'
export const USER_SOUND_PREFIX = 'user:'

export interface PresetSound {
  id: string
  url: string
  /** i18n key under settings.soundNames */
  nameKey: string
}

export const PRESET_SOUNDS: PresetSound[] = [
  { id: 'bell', url: '/sounds/bell.mp3', nameKey: 'bell' },
  { id: 'bell-b', url: '/sounds/bell-b.mp3', nameKey: 'bellB' },
  { id: 'bell-end', url: '/sounds/bell-end.mp3', nameKey: 'bellEnd' },
  { id: 'whistle', url: '/sounds/whistle.mp3', nameKey: 'whistle' },
  { id: 'clacker', url: '/sounds/clacker.mp3', nameKey: 'clacker' },
  { id: 'buzzer', url: '/sounds/buzzer.mp3', nameKey: 'buzzer' },
  { id: 'airhorn', url: '/sounds/airhorn.mp3', nameKey: 'airhorn' },
  { id: 'beep', url: '/sounds/beep.mp3', nameKey: 'beep' },
]

export const isUserSoundId = (id: string) => id.startsWith(USER_SOUND_PREFIX)
