import { useTranslation } from 'react-i18next'
import { cycleModeAt, cycleRemainingMs } from '../../core/timer/types'
import { formatMsClock, formatSeconds } from '../../lib/format'
import { useTimerStore } from '../../stores/timerStore'

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void document.documentElement.requestFullscreen?.()
  }
}

export function TimerScreen() {
  const { t } = useTranslation()
  const engine = useTimerStore((s) => s.engine)
  const togglePause = useTimerStore((s) => s.togglePause)
  const reset = useTimerStore((s) => s.reset)
  const skipPhase = useTimerStore((s) => s.skipPhase)
  const addThirtySeconds = useTimerStore((s) => s.addThirtySeconds)
  const startWorkout = useTimerStore((s) => s.startWorkout)

  const totalRounds = engine.segments.filter((s) => s.kind === 'round').length

  if (engine.status === 'finished') {
    const totalMs = engine.finishedAt - engine.startedAt
    return (
      <div className="timer timer--finished">
        <div className="timer__finished">
          <h1>{t('timer.finishedTitle')}</h1>
          <dl className="timer__stats">
            <div>
              <dt>{t('timer.roundsDone')}</dt>
              <dd>{totalRounds}</dd>
            </div>
            <div>
              <dt>{t('timer.totalTime')}</dt>
              <dd>{formatSeconds(totalMs / 1000)}</dd>
            </div>
          </dl>
          <div className="timer__finished-actions">
            <button type="button" className="btn btn--start" onClick={startWorkout}>
              {t('timer.again')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              {t('timer.back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const segment = engine.segments[engine.index]
  const paused = engine.status === 'paused'

  const confirmExit = () => {
    if (window.confirm(t('timer.confirmExit'))) reset()
  }

  const cycle = segment.cycle
  const cycleElapsed = segment.durationMs - engine.remainingMs
  const cycleMode = cycle ? cycleModeAt(cycle, cycleElapsed) : null

  const progress = segment.durationMs > 0 ? 1 - engine.remainingMs / segment.durationMs : 0
  const doneRounds = segment.kind === 'round' ? segment.round - 1 : segment.round
  const showDots = totalRounds > 1 && totalRounds <= 16
  const phaseLabel =
    segment.kind === 'warmup'
      ? t('timer.warmup')
      : segment.kind === 'rest'
        ? t('timer.rest')
        : t('timer.roundOf', { n: segment.round, total: totalRounds })

  const classes = [
    'timer',
    `timer--${segment.kind}`,
    engine.warned && !paused ? 'timer--warning' : '',
    paused ? 'timer--paused' : '',
  ].join(' ')

  return (
    <div className={classes}>
      <div className="timer__progress" aria-hidden="true">
        <div className="timer__progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <header className="timer__top">
        <button type="button" className="timer__icon-btn" aria-label={t('timer.exit')} onClick={confirmExit}>
          ✕
        </button>
        <span className="timer__phase">{phaseLabel}</span>
        <button
          type="button"
          className="timer__icon-btn"
          aria-label={t('timer.fullscreen')}
          onClick={toggleFullscreen}
        >
          ⛶
        </button>
      </header>

      {showDots && (
        <div className="timer__dots" aria-hidden="true">
          {Array.from({ length: totalRounds }, (_, i) => {
            const r = i + 1
            const cls =
              r <= doneRounds
                ? 'timer__dot timer__dot--done'
                : r === segment.round && segment.kind === 'round'
                  ? 'timer__dot timer__dot--current'
                  : 'timer__dot'
            return <span key={r} className={cls} />
          })}
        </div>
      )}

      <button type="button" className="timer__main" onClick={togglePause}>
        {paused && (
          <span className="timer__pause-icon" aria-hidden="true">
            ⏸
          </span>
        )}
        <span className="timer__time">{formatMsClock(engine.remainingMs)}</span>
        {cycle && cycleMode && (
          <span className={`timer__cycle timer__cycle--${cycleMode}`}>
            {t(`timer.${cycleMode}`)} {formatMsClock(cycleRemainingMs(cycle, cycleElapsed))}
          </span>
        )}
        <span className="timer__hint">{paused ? `${t('timer.paused')} — ${t('timer.tapToResume')}` : t('timer.tapToPause')}</span>
      </button>

      <footer className="timer__controls">
        <button type="button" className="btn btn--ghost" onClick={addThirtySeconds}>
          {t('timer.plus30')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={skipPhase}>
          {t('timer.skip')} ⏭
        </button>
      </footer>
    </div>
  )
}
