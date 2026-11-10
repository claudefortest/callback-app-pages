import * as THREE from 'three'
import { buildPhone } from './phone.js'
import { buildStudio } from './studio.js'
import { createScreen } from './screen.js'
import { createAudio } from './audio.js'

const root = document.documentElement
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (s) => document.querySelector(s)
const clamp = THREE.MathUtils.clamp
const smooth = (t) => t * t * (3 - 2 * t)

// ---------------------------------------------------------------- camera script
// Each cue is pinned to a spot in a page section. `frame` is millimetres of
// the object to fit on screen, so one cue works on a phone and a monitor.
const CUES = [
  { el: '#hero', p: 0.5, shot: { yaw: -18, pitch: 6, frame: 190, ox: 0.2, oy: 0, ty: 0, explode: 0, ts: 1 }, m: { frame: 345, ox: 0, oy: 0.28 } },
  { el: '#finish', p: 0.5, shot: { yaw: 9, pitch: 2, frame: 112, ox: 0.2, oy: 0, ty: 10, explode: 0, ts: 1 / 12 }, m: { frame: 200, ox: 0, oy: 0.24 } },
  { el: '#decision', p: 0.5, shot: { yaw: -40, pitch: 16, frame: 265, ox: 0, oy: 0.06, ty: 0, explode: 1, ts: 1 }, m: { frame: 470, ox: 0, oy: 0.1 } },
  { el: '#reminder', p: 0.15, shot: { yaw: 150, pitch: 8, frame: 175, ox: -0.2, oy: 0, ty: 16, explode: 0, ts: 1 }, m: { frame: 270, ox: 0, oy: 0.24 } },
  { el: '#reminder', p: 0.85, shot: { yaw: 215, pitch: -4, frame: 175, ox: -0.2, oy: 0, ty: 16, explode: 0, ts: 1 }, m: { frame: 270, ox: 0, oy: 0.24 } },
  { el: '#outro', p: 0.5, shot: { yaw: 360, pitch: 4, frame: 300, ox: 0, oy: -0.2, ty: 0, explode: 0, ts: 1 }, m: { frame: 450, ox: 0, oy: -0.24 } },
]
const KEYS = ['yaw', 'pitch', 'frame', 'ox', 'oy', 'ty', 'explode', 'ts']

// ---------------------------------------------------------------- engine
const canvas = $('#stage')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setClearColor(0x000000, 0)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
const phoneMobile = matchMedia('(max-width: 760px)').matches
let pixelRatio = Math.min(devicePixelRatio, phoneMobile ? 1.75 : 2)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(26, 1, 20, 2000)

const pmrem = new THREE.PMREMGenerator(renderer)
const studio = buildStudio()
scene.environment = pmrem.fromScene(studio, 0.03).texture
studio.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
pmrem.dispose()

const screen = createScreen(67.4, 145.4)
const { root: phone, parts } = buildPhone(screen.texture)
scene.add(phone)

let W = 1, H = 1
function resize() {
  W = innerWidth; H = innerHeight
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  measure()
}

// ---------------------------------------------------------------- scroll -> shot
let marks = []
function measure() {
  const portrait = W / H < 0.9
  const max = Math.max(0, document.documentElement.scrollHeight - H)
  marks = CUES.map((c) => {
    const el = $(c.el)
    const r = el.getBoundingClientRect()
    const y = clamp(r.top + scrollY + r.height * c.p - H / 2, 0, max)
    return { y, shot: { ...c.shot, ...(portrait ? c.m : {}) } }
  }).sort((a, b) => a.y - b.y)
}
function sample(s) {
  const out = {}
  let a = marks[0], b = marks[0], k = 0
  if (s >= marks[marks.length - 1].y) a = b = marks[marks.length - 1]
  else if (s > marks[0].y) {
    for (let i = 0; i < marks.length - 1; i++) {
      if (s >= marks[i].y && s < marks[i + 1].y) {
        a = marks[i]; b = marks[i + 1]
        k = smooth(clamp(((s - a.y) / (b.y - a.y) - 0.22) / 0.56, 0, 1)) // dwell at each cue
        break
      }
    }
  }
  for (const key of KEYS) out[key] = a.shot[key] + (b.shot[key] - a.shot[key]) * k
  return out
}

// ---------------------------------------------------------------- call + sound
const audio = createAudio()
const call = { state: 'ringing', t0: 0, dur: 0 }
let screenDirty = true
const holdBtns = [...document.querySelectorAll('[data-hold]')]
const setHoldLabel = (text) => holdBtns.forEach((b) => { b.querySelector('.hold__label').textContent = text })
let hangTimer, ringTimer

function answer() {
  if (call.state !== 'ringing') return
  call.state = 'connected'; call.t0 = performance.now(); screenDirty = true
  audio.pickup()
  setHoldLabel('Connected')
  holdBtns.forEach((b) => b.setAttribute('aria-disabled', 'true'))
  hangTimer = setTimeout(hangup, 12000)
}
function hangup() {
  call.dur = (performance.now() - call.t0) / 1000
  call.state = 'ended'; screenDirty = true
  audio.hangup()
  ringTimer = setTimeout(() => {
    call.state = 'ringing'; screenDirty = true
    setHoldLabel('Hold to answer')
    holdBtns.forEach((b) => b.removeAttribute('aria-disabled'))
  }, 2400)
}

const soundBtn = $('#toggle-sound')
const syncSound = () => { soundBtn.setAttribute('aria-pressed', audio.on); soundBtn.textContent = audio.on ? 'Sound on' : 'Sound off' }
soundBtn.addEventListener('click', () => { audio.set(!audio.on); syncSound(); if (audio.on) audio.press() })

// Pointer (and phone tilt) rotates the studio the metal is reflecting.
const aim = { x: 0, y: 0, tx: 0, ty: 0 }
addEventListener('pointermove', (e) => { aim.tx = (e.clientX / W) * 2 - 1; aim.ty = (e.clientY / H) * 2 - 1 }, { passive: true })
let tilting = false
function enableTilt() {
  if (tilting || typeof DeviceOrientationEvent === 'undefined') return
  const start = () => {
    tilting = true
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return
      aim.tx = clamp(e.gamma / 30, -1, 1); aim.ty = clamp(((e.beta ?? 50) - 50) / 30, -1, 1)
    })
  }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then((r) => r === 'granted' && start()).catch(() => {})
  else start()
}

// Hold to answer: a progress ring that has to fill before the call connects.
const HOLD_MS = 900
holdBtns.forEach((btn) => {
  const prog = btn.querySelector('.hold__prog')
  const C = 2 * Math.PI * 19
  prog.style.strokeDasharray = C
  let raf = 0, t0 = 0, active = false
  const set = (p) => { prog.style.strokeDashoffset = C * (1 - p) }
  set(0)
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / HOLD_MS)
    set(p)
    if (p >= 1) { active = false; answer() } else raf = requestAnimationFrame(tick)
  }
  const begin = () => {
    if (active || btn.getAttribute('aria-disabled') === 'true') return
    active = true
    if (!audio.on && !btn.dataset.touched) { audio.set(true); syncSound(); enableTilt() }
    btn.dataset.touched = '1'
    audio.press()
    btn.classList.add('is-holding')
    t0 = performance.now(); raf = requestAnimationFrame(tick)
  }
  const cancel = () => {
    if (!active && !btn.classList.contains('is-holding')) return
    // a release after the full hold counts, even if a frame was skipped
    if (active && performance.now() - t0 >= HOLD_MS) { active = false; cancelAnimationFrame(raf); btn.classList.remove('is-holding'); answer(); return }
    active = false; cancelAnimationFrame(raf); btn.classList.remove('is-holding'); set(0)
  }
  btn.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { btn.setPointerCapture?.(e.pointerId); begin() } })
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) btn.addEventListener(t, cancel)
  btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin() } })
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') cancel() })
  btn.addEventListener('contextmenu', (e) => e.preventDefault())
  // when the call ends the ring returns to empty
  setInterval(() => { if (!active && call.state !== 'connected') set(0); else if (call.state === 'connected') set(1) }, 250)
})

// ---------------------------------------------------------------- blueprint
const bpBtn = $('#toggle-blueprint')
let blueprint = false, lineMat = null
function inkColor() {
  const c = getComputedStyle(root).getPropertyValue('--ink').trim()
  return new THREE.Color(c || '#101828')
}
function setBlueprint(on) {
  blueprint = on
  bpBtn.setAttribute('aria-pressed', on)
  if (!lineMat) lineMat = new THREE.LineBasicMaterial({ color: inkColor() })
  lineMat.color.copy(inkColor())
  for (const p of parts) p.obj.traverse((o) => {
    if (!o.isMesh) return
    if (!o.userData.edges) { o.userData.edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), lineMat); o.add(o.userData.edges) }
    o.userData.edges.visible = on
    for (const m of [].concat(o.material)) m.visible = !on
  })
}
bpBtn.addEventListener('click', () => setBlueprint(!blueprint))
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => lineMat && lineMat.color.copy(inkColor()))

// ---------------------------------------------------------------- labels
const labelsEl = $('#labels')
const leaders = $('#leaders')
const NS = 'http://www.w3.org/2000/svg'
const lab = parts.map((p) => {
  const el = document.createElement('div')
  el.className = 'plabel'
  el.innerHTML = `<b>${p.label}</b><span>${p.detail}</span>`
  labelsEl.append(el)
  const line = document.createElementNS(NS, 'line'), dot = document.createElementNS(NS, 'circle')
  dot.setAttribute('r', 2.5)
  leaders.append(line, dot)
  return { el, line, dot }
})
const v3 = new THREE.Vector3(), box = new THREE.Box3()
const toScreen = (v) => { v3.copy(v).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H] }
function layoutLabels(e) {
  const vis = smooth(clamp((e - 0.62) / 0.38, 0, 1))
  labelsEl.style.opacity = leaders.style.opacity = vis
  if (vis < 0.01) { labelsEl.style.visibility = leaders.style.visibility = 'hidden'; return }
  labelsEl.style.visibility = leaders.style.visibility = 'visible'
  const narrow = W / H < 0.9
  const lw = narrow ? 84 : 156, gap = narrow ? 18 : 48, sp = narrow ? 40 : 56

  // columns sit just outside the silhouette of the exploded stack
  let minX = Infinity, maxX = -Infinity
  const corner = new THREE.Vector3()
  for (const p of parts) {
    box.setFromObject(p.obj)
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      const [x] = toScreen(corner); minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    }
  }
  const copy = $('#decision .copy')?.getBoundingClientRect()
  const minY = Math.max(narrow ? 24 : 72, copy ? copy.bottom + (narrow ? 12 : 24) : 0)
  const maxY = H - 40
  const cols = [parts.filter((p) => p.side === 'l'), parts.filter((p) => p.side === 'r')]
  cols.forEach((col, side) => {
    const edge = side === 0 ? Math.max(lw + 12, minX - gap) : Math.min(W - lw - 12, maxX + gap)
    const pts = col.map((p) => {
      const [x, y] = toScreen(v3.copy(side === 0 ? p.anchorL : p.anchorR).addScaledVector(p.lift, p.t).clone())
      return { i: parts.indexOf(p), x, y }
    }).sort((a, b) => a.y - b.y)
    const ys = []
    pts.forEach((c, k) => { ys[k] = Math.max(clamp(c.y, minY, maxY), k ? ys[k - 1] + sp : 0) })
    for (let k = ys.length - 1; k >= 0; k--) { const cap = k === ys.length - 1 ? maxY : ys[k + 1] - sp; if (ys[k] > cap) ys[k] = cap }
    pts.forEach((c, k) => {
      const L = lab[c.i], y = ys[k]
      L.el.style.width = lw + 'px'
      L.el.classList.toggle('plabel--l', side === 0)
      L.el.style.transform = `translate(${side === 0 ? edge - lw : edge}px, ${y}px) translateY(-50%)`
      const ex = side === 0 ? edge + 8 : edge - 8
      L.line.setAttribute('x1', ex); L.line.setAttribute('y1', y); L.line.setAttribute('x2', c.x); L.line.setAttribute('y2', c.y)
      L.dot.setAttribute('cx', c.x); L.dot.setAttribute('cy', c.y)
    })
  })
}

// ---------------------------------------------------------------- the loop
const cur = { ...sampleInit() }
function sampleInit() { return Object.fromEntries(KEYS.map((k) => [k, k === 'ts' ? 1 : 0])) }
let time = 0, last = performance.now(), ringIndex = -1, lastDraw = 0
let fpsAcc = 0, fpsN = 0, fpsT = 0, born = performance.now()
const RING = 2.6
const target = new THREE.Vector3()
const damp = (a, b, k, dt) => a + (b - a) * (reduced ? 1 : 1 - Math.exp(-k * dt))

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  // adaptive quality: step the resolution down if the frame rate sags
  fpsAcc += dt; fpsN++; fpsT += dt
  if (fpsT > 2 && now - born > 3000) {
    if (fpsN / fpsAcc < 40 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); resize() }
    fpsAcc = fpsN = fpsT = 0
  }

  const t = sample(scrollY)
  const k = reduced ? 1 : 1 - Math.exp(-5.5 * dt)
  for (const key of KEYS) cur[key] += (t[key] - cur[key]) * (key === 'ts' ? 1 - Math.exp(-4 * dt) : k)
  if (reduced) cur.ts = 1

  // one clock drives every moving part
  time += dt * cur.ts
  const ringing = call.state === 'ringing'
  const phase = time % RING
  const amp = ringing && !reduced && phase < 1.1 ? Math.sin((phase / 1.1) * Math.PI) : 0
  phone.position.set(Math.sin(time * 95) * 0.28 * amp, Math.sin(time * 83 + 1.3) * 0.22 * amp, 0)
  phone.rotation.z = Math.sin(time * 91) * 0.0035 * amp
  const idx = Math.floor(time / RING)
  if (idx !== ringIndex) { ringIndex = idx; if (ringing && audio.on && !document.hidden) audio.ring() }

  // staggered explode: top parts leave first and come back last
  const e = clamp(cur.explode, 0, 1)
  for (const p of parts) {
    const delay = (1 - p.order) * 0.42
    p.t = smooth(clamp((e - delay) / 0.58, 0, 1))
    p.obj.position.copy(p.lift).multiplyScalar(p.t)
  }

  // the screen is drawn from the same clock
  if (call.state !== 'ended' ? now - lastDraw > 66 && (screenDirty || !reduced) : screenDirty) {
    const elapsed = call.state === 'connected' ? (now - call.t0) / 1000 : call.dur
    screen.draw(call.state, reduced ? 0 : time, elapsed)
    lastDraw = now; screenDirty = false
  }

  aim.x += (aim.tx - aim.x) * (1 - Math.exp(-3 * dt)); aim.y += (aim.ty - aim.y) * (1 - Math.exp(-3 * dt))
  scene.environmentRotation.set(aim.y * 0.45, -aim.x * 0.8, 0)

  // camera: frame by size, then orbit
  const portrait = W / H < 0.9
  const dist = cur.frame / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const yaw = THREE.MathUtils.degToRad(cur.yaw), pitch = THREE.MathUtils.degToRad(cur.pitch)
  target.set(0, cur.ty, 0)
  camera.position.set(
    target.x + dist * Math.sin(yaw) * Math.cos(pitch),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(yaw) * Math.cos(pitch),
  )
  camera.lookAt(target)
  camera.setViewOffset(W, H, -cur.ox * W, -cur.oy * H, W, H)
  camera.updateMatrixWorld()
  void portrait

  layoutLabels(e)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- boot
async function boot() {
  try { await Promise.all([document.fonts.load('600 60px "Bricolage Grotesque"'), document.fonts.load('400 38px "Bricolage Grotesque"')]) } catch {}
  resize()
  Object.assign(cur, sample(scrollY))
  cur.ts = sample(scrollY).ts
  screen.draw('ringing', 0, 0)
  await renderer.compileAsync(scene, camera)
  addEventListener('resize', resize)
  addEventListener('load', measure)
  document.fonts.ready.then(() => { screenDirty = true; measure() })
  new ResizeObserver(measure).observe(document.body)
  root.classList.add('ready')
  requestAnimationFrame((n) => { last = n; frame(n) })
}
boot().catch((err) => { console.error(err); root.classList.add('no-3d') })
syncSound()
