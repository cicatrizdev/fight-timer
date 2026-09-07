import { SettingsScreen } from './features/settings/SettingsScreen'
import { TimerScreen } from './features/timer/TimerScreen'
import { useTimerStore } from './stores/timerStore'

export default function App() {
  const status = useTimerStore((s) => s.engine.status)
  return status === 'idle' ? <SettingsScreen /> : <TimerScreen />
}
