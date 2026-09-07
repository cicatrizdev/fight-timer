/// <reference lib="webworker" />
// Ticks from a worker survive background-tab throttling far better than
// main-thread timers. The engine itself is timestamp-based, so tick cadence
// only affects UI smoothness and cue latency, never accuracy.

const ctx = self as unknown as DedicatedWorkerGlobalScope

let interval: ReturnType<typeof setInterval> | undefined

ctx.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  if (e.data === 'start' && interval === undefined) {
    interval = setInterval(() => ctx.postMessage('tick'), 200)
  } else if (e.data === 'stop' && interval !== undefined) {
    clearInterval(interval)
    interval = undefined
  }
}
