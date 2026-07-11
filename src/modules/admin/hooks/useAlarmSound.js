import { useEffect, useRef } from 'react'

// Three-beep repeating alarm using the Web Audio API.
// Plays indefinitely while `active` is true, stops when false.
export function useAlarmSound(active) {
  const ref = useRef({ ctx: null, nextTime: 0, timerId: null })

  useEffect(() => {
    const s = ref.current

    if (!active) {
      clearInterval(s.timerId)
      s.timerId = null
      s.ctx?.close().catch(() => {})
      s.ctx = null
      return
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    s.ctx      = ctx
    s.nextTime = ctx.currentTime + 0.08

    // Pattern: C6 → G5 → C6, then 0.7 s silence
    const PATTERN = [
      { freq: 1047, offset: 0,    dur: 0.13 },
      { freq: 783,  offset: 0.21, dur: 0.13 },
      { freq: 1047, offset: 0.42, dur: 0.13 },
    ]
    const CYCLE      = 1.15
    const LOOK_AHEAD = 1.0

    function scheduleBeep(freq, t, dur) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.connect(env)
      env.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      env.gain.setValueAtTime(0,    t)
      env.gain.linearRampToValueAtTime(0.38, t + 0.010)
      env.gain.setValueAtTime(0.38, t + dur - 0.010)
      env.gain.linearRampToValueAtTime(0,    t + dur)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }

    function pump() {
      if (!s.ctx) return
      while (s.nextTime < ctx.currentTime + LOOK_AHEAD) {
        for (const { freq, offset, dur } of PATTERN) {
          scheduleBeep(freq, s.nextTime + offset, dur)
        }
        s.nextTime += CYCLE
      }
    }

    pump()
    s.timerId = setInterval(pump, 400)

    return () => {
      clearInterval(s.timerId)
      s.timerId = null
      ctx.close().catch(() => {})
      s.ctx = null
    }
  }, [active])
}
