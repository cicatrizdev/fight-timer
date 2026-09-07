import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { USER_SOUND_PREFIX } from '../core/audio/sounds'

export interface UserSound {
  id: string
  name: string
  blob: Blob
  createdAt: number
}

interface FightTimerDB extends DBSchema {
  sounds: { key: string; value: UserSound }
}

let dbPromise: Promise<IDBPDatabase<FightTimerDB>> | undefined

function db() {
  dbPromise ??= openDB<FightTimerDB>('fight-timer', 1, {
    upgrade(database) {
      database.createObjectStore('sounds', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export async function listUserSounds(): Promise<UserSound[]> {
  return (await db()).getAll('sounds')
}

export async function saveUserSound(name: string, blob: Blob): Promise<UserSound> {
  const sound: UserSound = {
    id: `${USER_SOUND_PREFIX}${crypto.randomUUID()}`,
    name,
    blob,
    createdAt: Date.now(),
  }
  await (await db()).put('sounds', sound)
  return sound
}

export async function deleteUserSound(id: string): Promise<void> {
  await (await db()).delete('sounds', id)
}
