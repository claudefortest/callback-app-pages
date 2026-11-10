import * as THREE from 'three'

// The phone's display is a canvas drawn live. State and the shared clock
// decide what it shows, so the screen is part of the scene, not a video.
const W = 720, H = 1560
const C = { bg: '#0B1020', ink: '#E8ECF4', mute: '#9AA5BA', soft: '#C7CEDD', signal: '#2F4BFF', answer: '#17A56B', end: '#E5484D' }
const FONT = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif'
const HANDSET = new Path2D('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z')
const QUOTE = 'Your report is ready. I need a yes or no on one section.'

export function createScreen(mmW, mmH) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  // Cap UVs come from millimetre coordinates, so map mm -> 0..1.
  texture.repeat.set(1 / mmW, 1 / mmH)
  texture.offset.set(0.5, 0.5)

  const font = (w, px) => { ctx.font = `${w} ${px}px ${FONT}` }
  const centered = (text, y, color) => { ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, W / 2, y) }
  const wrap = (text, y, max, lh, color) => {
    ctx.fillStyle = color; ctx.textAlign = 'center'
    let line = ''
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > max && line) { ctx.fillText(line, W / 2, y); y += lh; line = word } else line = test
    }
    ctx.fillText(line, W / 2, y)
  }
  const circleBtn = (cx, cy, fill, rot = 0) => {
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(3.2, 3.2); ctx.translate(-12, -12)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.9; ctx.lineJoin = 'round'; ctx.stroke(HANDSET)
    ctx.restore()
  }
  const chrome = () => {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.roundRect(W / 2 - 105, 44, 210, 62, 31); ctx.fill()
    font(600, 34); ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText('9:41', 72, 92)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.beginPath(); ctx.roundRect(W / 2 - 120, 1500, 240, 10, 5); ctx.fill()
  }
  const avatar = (y) => {
    ctx.fillStyle = C.signal; ctx.beginPath(); ctx.arc(W / 2, y, 84, 0, Math.PI * 2); ctx.fill()
    font(700, 92); centered('C', y + 32, '#fff')
  }

  function draw(state, time, elapsed) {
    chrome()
    if (state === 'ringing') {
      font(400, 30); centered('Callback · incoming call', 400, C.mute)
      for (let k = 0; k < 3; k++) {
        const p = (time * 0.9 + k / 3) % 1
        ctx.strokeStyle = C.signal; ctx.globalAlpha = (1 - p) * 0.4; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(W / 2, 560, 84 + p * 120, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = 1
      avatar(560)
      font(600, 60); centered('Claude', 760, C.ink)
      font(400, 30); centered('mobile', 806, C.mute)
      font(400, 38); wrap(`“${QUOTE}”`, 920, 560, 52, C.soft)
      circleBtn(190, 1320, C.end, 2.36); circleBtn(530, 1320, C.answer)
      font(400, 28); ctx.fillStyle = C.mute; ctx.textAlign = 'center'
      ctx.fillText('Not now', 190, 1430); ctx.fillText('Answer', 530, 1430)
    } else if (state === 'connected') {
      font(400, 30); centered('Callback', 400, C.mute)
      avatar(560)
      font(600, 60); centered('Claude', 760, C.ink)
      const s = Math.floor(elapsed)
      font(500, 34); centered(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 812, C.answer)
      const env = Math.min(1, elapsed / 0.4)
      for (let i = 0; i < 21; i++) {
        const h = 12 + 130 * Math.abs(Math.sin(time * 5.2 + i * 0.62) * Math.sin(time * 2.3 + i * 0.37)) * env
        ctx.fillStyle = C.answer
        ctx.beginPath(); ctx.roundRect(W / 2 - 210 + i * 20 - 4, 960 - h / 2, 8, h, 4); ctx.fill()
      }
      font(400, 38); wrap(`“${QUOTE}”`, 1110, 560, 52, C.soft)
      circleBtn(W / 2, 1360, C.end, 2.36)
      font(400, 28); centered('End', 1470, C.mute)
    } else {
      font(600, 56); centered('Call ended', 720, C.ink)
      const s = Math.floor(elapsed)
      font(400, 34); centered(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 780, C.mute)
    }
    texture.needsUpdate = true
  }
  return { texture, draw }
}
