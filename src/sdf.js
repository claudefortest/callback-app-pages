import * as THREE from 'three'

// 2D signed-distance shapes. Units are millimetres, negative = inside.
export const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r

export const rrect = (cx, cy, w, h, r) => (x, y) => {
  const qx = Math.abs(x - cx) - (w / 2 - r)
  const qy = Math.abs(y - cy) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

export const capsule = (ax, ay, bx, by, r) => (x, y) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

export const union = (...f) => (x, y) => Math.min(...f.map((g) => g(x, y)))
export const subtract = (a, ...b) => (x, y) => Math.max(a(x, y), ...b.map((g) => -g(x, y)))

// Polynomial smooth union: the "melt" step. k is the blend radius in mm.
export const smooth = (k, ...f) => (x, y) => {
  let d = f[0](x, y)
  for (let i = 1; i < f.length; i++) {
    const e = f[i](x, y)
    const h = Math.max(k - Math.abs(d - e), 0) / k
    d = Math.min(d, e) - h * h * k * 0.25
  }
  return d
}

// Marching squares over a sampled field. Returns closed loops of [x, y].
// Every contour point is keyed by the grid edge it sits on, so neighbouring
// cells stitch together exactly without floating point matching.
export function traceLoops(sdf, bounds, step = 0.25) {
  const [x0, y0, x1, y1] = bounds
  const nx = Math.ceil((x1 - x0) / step) + 1
  const ny = Math.ceil((y1 - y0) / step) + 1
  const v = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = sdf(x0 + i * step, y0 + j * step)
  const at = (i, j) => v[j * nx + i]

  const pts = new Map() // key -> [x, y]
  const adj = new Map() // key -> [keys]
  const hKey = (i, j) => `h${i},${j}`
  const vKey = (i, j) => `v${i},${j}`
  const hPt = (i, j) => {
    const a = at(i, j), b = at(i + 1, j), t = a / (a - b)
    return [x0 + (i + t) * step, y0 + j * step]
  }
  const vPt = (i, j) => {
    const a = at(i, j), b = at(i, j + 1), t = a / (a - b)
    return [x0 + i * step, y0 + (j + t) * step]
  }
  const link = (ka, pa, kb, pb) => {
    pts.set(ka, pa); pts.set(kb, pb)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka).push(kb); adj.get(kb).push(ka)
  }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      const mask = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0)
      if (mask === 0 || mask === 15) continue
      // cell edges: bottom, right, top, left
      const E = {
        B: () => [hKey(i, j), hPt(i, j)],
        R: () => [vKey(i + 1, j), vPt(i + 1, j)],
        T: () => [hKey(i, j + 1), hPt(i, j + 1)],
        L: () => [vKey(i, j), vPt(i, j)],
      }
      const seg = (p, q) => { const [ka, pa] = E[p](), [kb, pb] = E[q](); link(ka, pa, kb, pb) }
      const centre = (a + b + c + d) / 4 < 0
      switch (mask) {
        case 1: case 14: seg('L', 'B'); break
        case 2: case 13: seg('B', 'R'); break
        case 3: case 12: seg('L', 'R'); break
        case 4: case 11: seg('R', 'T'); break
        case 6: case 9: seg('B', 'T'); break
        case 7: case 8: seg('L', 'T'); break
        case 5: if (centre) { seg('B', 'R'); seg('L', 'T') } else { seg('L', 'B'); seg('R', 'T') } break
        case 10: if (centre) { seg('L', 'B'); seg('R', 'T') } else { seg('B', 'R'); seg('L', 'T') } break
      }
    }
  }

  const seen = new Set()
  const loops = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const loop = []
    let prev = null, cur = start
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      loop.push(pts.get(cur))
      const next = adj.get(cur).find((k) => k !== prev && !seen.has(k)) ?? null
      prev = cur
      cur = next
    }
    if (loop.length > 3) loops.push(simplify(loop))
  }
  return loops
}

// Drop points that sit on a straight run. Keeps curves, removes grid noise.
function simplify(loop, tol = 0.0006) {
  let out = loop
  for (let pass = 0; pass < 1; pass++) {
    const keep = []
    for (let i = 0; i < out.length; i++) {
      const p = out[(i - 1 + out.length) % out.length], c = out[i], n = out[(i + 1) % out.length]
      const cross = Math.abs((c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]))
      const len = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1
      if (cross / len > tol) keep.push(c)
    }
    out = keep.length > 3 ? keep : out
  }
  return out
}

const area = (l) => {
  let s = 0
  for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a[0] * b[1] - b[0] * a[1] }
  return s / 2
}
const contains = (loop, [px, py]) => {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Turn loops into THREE.Shapes: even nesting depth = outline, odd = hole.
export function loopsToShapes(loops) {
  const info = loops.map((l, i) => {
    const depth = loops.reduce((n, o, k) => (k !== i && contains(o, l[0]) ? n + 1 : n), 0)
    return { l, depth, a: Math.abs(area(l)) }
  })
  const shapes = info.filter((o) => o.depth % 2 === 0).map((o) => ({ o, s: new THREE.Shape(o.l.map(([x, y]) => new THREE.Vector2(x, y))) }))
  for (const h of info.filter((o) => o.depth % 2 === 1)) {
    const owner = shapes.filter(({ o }) => contains(o.l, h.l[0])).sort((a, b) => a.o.a - b.o.a)[0]
    if (owner) owner.s.holes.push(new THREE.Path(h.l.map(([x, y]) => new THREE.Vector2(x, y))))
  }
  return shapes.map(({ s }) => s)
}

export const shapesFrom = (sdf, bounds, step) => loopsToShapes(traceLoops(sdf, bounds, step))
