import * as THREE from 'three'

// A small photo studio that only exists to be reflected. Dark room, one
// off-axis softbox, two strip lights and a rim light above.
export function buildStudio() {
  const s = new THREE.Scene()
  s.background = new THREE.Color(0x05070c)

  const dome = new THREE.SphereGeometry(100, 32, 16)
  const col = []
  const top = new THREE.Color('#4a5a82'), bottom = new THREE.Color('#141a2c'), c = new THREE.Color()
  const pos = dome.attributes.position
  for (let i = 0; i < pos.count; i++) {
    c.copy(bottom).lerp(top, THREE.MathUtils.clamp(pos.getY(i) / 100 * 0.5 + 0.5, 0, 1))
    col.push(c.r, c.g, c.b)
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })))

  const panel = (w, h, k, [x, y, z], tint = [1, 0.98, 0.95]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide, toneMapped: false }),
    )
    m.position.set(x, y, z)
    m.lookAt(0, 0, 0)
    s.add(m)
  }
  panel(44, 30, 8, [-30, 26, 30]) // key softbox, off axis
  panel(6, 70, 12, [44, 4, 14]) // strip, edge line
  panel(6, 70, 8, [-46, -6, -10], [0.85, 0.92, 1]) // strip, cool
  panel(60, 16, 5, [0, 52, -24]) // rim from above and behind
  panel(80, 10, 1.6, [0, -42, 22], [0.8, 0.88, 1]) // low bounce
  return s
}
