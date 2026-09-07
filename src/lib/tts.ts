// Spoken announcements via the Speech Synthesis API.
// Default voices are often robotic; we rank known higher-quality ones first
// and let the user pick a specific voice in the settings.

let voices: SpeechSynthesisVoice[] = []
const listeners = new Set<() => void>()

function refreshVoices() {
  voices = window.speechSynthesis?.getVoices() ?? []
  listeners.forEach((l) => l())
}

if ('speechSynthesis' in window) {
  refreshVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices)
}

/** Voices usable for a UI language ("pt-BR" also matches "pt-PT" etc.), best first. */
export function voicesForLang(lang: string): SpeechSynthesisVoice[] {
  const prefix = lang.split('-')[0].toLowerCase()
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith(prefix))
    .sort((a, b) => score(b, lang) - score(a, lang))
}

export function onVoicesChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function score(v: SpeechSynthesisVoice, lang: string): number {
  let s = 0
  if (v.lang.toLowerCase() === lang.toLowerCase()) s += 4
  const name = v.name.toLowerCase()
  // Remote/neural voices (Chrome's "Google …", Edge's "… Natural", macOS
  // enhanced voices) sound far better than the legacy local ones.
  if (/natural|neural|premium|enhanced|aprimorada/.test(name)) s += 8
  if (name.includes('google')) s += 6
  if (/luciana|felipe|joana|samantha/.test(name)) s += 2
  if (v.default) s += 1
  return s
}

export function speak(text: string, lang: string, voiceName?: string | null): void {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  const voice = voiceName
    ? voices.find((v) => v.name === voiceName)
    : voicesForLang(lang)[0]
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.rate = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
