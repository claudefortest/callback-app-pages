// Synthesised sound only: filtered noise bursts for clicks, plain tones for
// the ring. No audio files. Browsers gate audio behind a gesture, so the
// context is created on the first press.
export function createAudio() {
  let ctx = null, master = null, noise = null, on = false

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination)
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
      const d = noise.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  const click = (freq = 2400, dur = 0.03, vol = 0.5, at = 0) => {
    if (!on || !ensure()) return
    const t = ctx.currentTime + at
    const src = ctx.createBufferSource(); src.buffer = noise
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f).connect(g).connect(master); src.start(t, 0, dur + 0.01)
  }
  const tone = (freq, at, dur, vol, type = 'sine') => {
    if (!on || !ensure()) return
    const t = ctx.currentTime + at
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05)
  }

  return {
    get on() { return on },
    unlock() { ensure() },
    set(v) { on = v; if (v) ensure() },
    press() { click(2600, 0.025, 0.35) },
    ring() { for (const t of [0, 0.55]) { tone(440, t, 0.4, 0.05); tone(480, t, 0.4, 0.05) } },
    pickup() { click(3200, 0.02, 0.6); tone(660, 0.04, 0.14, 0.07); tone(990, 0.16, 0.22, 0.06) },
    hangup() { click(1400, 0.04, 0.6); tone(330, 0, 0.2, 0.05) },
  }
}
