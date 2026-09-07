import { useEffect, useRef } from 'react'
import { formatSeconds } from '../../lib/format'

interface StepperProps {
  label: string
  value: number
  display: string
  onChange: (next: number) => void
  step: number
  min: number
  max: number
  /** Parses typed input (from tapping the value); return null to reject. */
  parse?: (raw: string) => number | null
}

function Stepper({ label, value, display, onChange, step, min, max, parse }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({})

  const bump = (dir: 1 | -1) => {
    const next = clamp(valueRef.current + dir * step)
    if (next !== valueRef.current) onChange(next)
  }

  const startRepeat = (dir: 1 | -1) => {
    bump(dir)
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => bump(dir), 90)
    }, 450)
  }

  const stopRepeat = () => {
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.repeat)
    timers.current = {}
  }

  useEffect(() => stopRepeat, [])

  const edit = () => {
    if (!parse) return
    const raw = window.prompt(label, display)?.trim()
    if (!raw) return
    const parsed = parse(raw)
    if (parsed !== null && Number.isFinite(parsed)) onChange(clamp(parsed))
  }

  const btnProps = (dir: 1 | -1) => ({
    onPointerDown: () => startRepeat(dir),
    onPointerUp: stopRepeat,
    onPointerLeave: stopRepeat,
    onPointerCancel: stopRepeat,
    // Pointer taps are handled above; keyboard activation arrives as a click
    // with detail 0.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) bump(dir)
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="field__controls">
        <button type="button" className="field__btn" aria-label={`${label} −`} disabled={value <= min} {...btnProps(-1)}>
          −
        </button>
        <button type="button" className="field__value" onClick={edit} disabled={!parse}>
          {display}
        </button>
        <button type="button" className="field__btn" aria-label={`${label} +`} disabled={value >= max} {...btnProps(1)}>
          +
        </button>
      </div>
    </div>
  )
}

const parseInt10 = (raw: string): number | null => {
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

/** Accepts "3:00", "0:45" or plain seconds ("180"). */
const parseDuration = (raw: string): number | null => {
  const m = raw.match(/^(\d+):([0-5]?\d)$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  return /^\d+$/.test(raw) ? Number(raw) : null
}

export function NumberField(
  props: Omit<StepperProps, 'display' | 'step' | 'min' | 'max' | 'parse'> & { min?: number; max?: number },
) {
  const { min = 1, max = 99 } = props
  return <Stepper {...props} display={String(props.value)} step={1} min={min} max={max} parse={parseInt10} />
}

export function DurationField(
  props: Omit<StepperProps, 'display' | 'step' | 'min' | 'max' | 'parse'> & { step?: number; min?: number; max?: number },
) {
  const { step = 5, min = 0, max = 3600 } = props
  return (
    <Stepper {...props} display={formatSeconds(props.value)} step={step} min={min} max={max} parse={parseDuration} />
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true" />
    </label>
  )
}
