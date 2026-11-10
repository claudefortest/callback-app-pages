import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rrect, circle, capsule, subtract, smooth, shapesFrom } from './sdf.js'

// Everything below is in real millimetres. +z points out of the screen.
const BOUNDS = [-40, -80, 40, 80]
const CAM = { x: 17, y: 52 }

// 2D field -> traced outline -> extruded with a bevel -> creased normals.
function solid(sdf, { depth, bevel = 0.05, z = 0, bounds = BOUNDS, step = 0.25 }) {
  const shapes = shapesFrom(sdf, bounds, step)
  let g = new THREE.ExtrudeGeometry(shapes, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1,
  })
  g.translate(0, 0, z - depth / 2)
  g = toCreasedNormals(g, Math.PI / 6)
  g.computeBoundingBox()
  return g
}

const thickness = (g) => +(g.boundingBox.max.z - g.boundingBox.min.z).toFixed(1)

export function buildPhone(screenTexture) {
  const root = new THREE.Group()
  const parts = []

  // Two materials per part: the flat face, then the edge.
  const satin = new THREE.MeshPhysicalMaterial({ color: '#9ea3ac', metalness: 1, roughness: 0.34, anisotropy: 0.7, anisotropyRotation: Math.PI / 2 })
  const polished = new THREE.MeshPhysicalMaterial({ color: '#d3d6dd', metalness: 1, roughness: 0.1 })
  const frosted = new THREE.MeshPhysicalMaterial({ color: '#d5dae6', metalness: 0, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 })
  const frostedEdge = new THREE.MeshPhysicalMaterial({ color: '#c3c9d8', metalness: 0.2, roughness: 0.25 })
  // Glass shows reflections only, added on top, so it can't fake a hot spot.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, // colour adds, canvas alpha stays
  })
  const coverGlass = new THREE.MeshPhysicalMaterial({ color: '#0b1226', metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.2, depthWrite: false })
  const screen = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false })
  const panelEdge = new THREE.MeshStandardMaterial({ color: '#05070c', roughness: 0.6 })
  const pcb = new THREE.MeshPhysicalMaterial({ color: '#27364b', metalness: 0.15, roughness: 0.55 })
  const pcbEdge = new THREE.MeshPhysicalMaterial({ color: '#c9a86a', metalness: 1, roughness: 0.3 })
  const chip = new THREE.MeshStandardMaterial({ color: '#12161d', metalness: 0.2, roughness: 0.45 })
  const foil = new THREE.MeshPhysicalMaterial({ color: '#c3c7cf', metalness: 0.6, roughness: 0.42 })
  const lensGlass = new THREE.MeshPhysicalMaterial({
    color: 0x04060b, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.9, iridescenceIOR: 1.6, side: THREE.DoubleSide,
  })

  const add = (name, label, detail, objects, { lift, order, anchor }) => {
    const obj = new THREE.Group()
    obj.name = name
    objects.forEach((o) => obj.add(o))
    root.add(obj)
    const [x0, x1, ay, az] = anchor
    parts.push({ name, label, detail, obj, lift: new THREE.Vector3(...lift), order, side: lift[2] > 0 ? 'r' : 'l', anchorL: new THREE.Vector3(x0, ay, az), anchorR: new THREE.Vector3(x1, ay, az) })
  }
  const mesh = (g, m) => new THREE.Mesh(g, m)

  // Cover glass, 0.7 mm
  const coverG = solid(rrect(0, 0, 68.4, 146.4, 9.6), { depth: 0.45, bevel: 0.12, z: 3.4 })
  add('cover', 'Cover glass', `${thickness(coverG)} mm`, [mesh(coverG, [coverGlass, coverGlass])], { lift: [0, 0, 58], order: 1, anchor: [-32, 32, 60, 3.75] })

  // Display: the screen texture is mapped in millimetres onto the front cap.
  const dispG = solid(rrect(0, 0, 67.4, 145.4, 9), { depth: 0.45, bevel: 0.05, z: 2.65 })
  add('display', 'Display', `${thickness(dispG)} mm`, [mesh(dispG, [screen, panelEdge])], { lift: [0, 0, 38], order: 0.85, anchor: [-31, 31, 20, 2.9] })

  // Frame: outline minus opening, plus four side buttons.
  const frameG = solid(subtract(rrect(0, 0, 71, 149, 10.9), rrect(0, 0, 69.6, 147.6, 9.9)), { depth: 7, bevel: 0.3, step: 0.2 })
  const frameObjs = [mesh(frameG, [satin, polished])]
  const button = (x, y, len) => {
    const g = solid(capsule(-len / 2 + 1.2, 0, len / 2 - 1.2, 0, 1.2), { depth: 0.9, bevel: 0.15, bounds: [-14, -4, 14, 4], step: 0.1 })
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)) // (x,y,z) -> (z,x,y)
    g.translate(x, y, 0.4)
    return mesh(g, [satin, polished])
  }
  frameObjs.push(button(-35.9, 44, 8), button(-35.9, 28, 14), button(-35.9, 9, 14), button(35.9, 30, 20))
  const fw = frameG.boundingBox
  add('frame', 'Titanium frame', `${(fw.max.x - fw.min.x).toFixed(1)} × ${(fw.max.y - fw.min.y).toFixed(1)} mm`, frameObjs, { lift: [0, 0, 0], order: 0.5, anchor: [-35.6, 35.6, -30, 0] })

  // Logic board: three shapes melted together, with screw holes and chips.
  const board = subtract(
    smooth(3.5, rrect(0, 50, 58, 42, 2.5), rrect(0, -54, 44, 26, 2.5), rrect(0, -2, 20, 86, 2)),
    circle(-24, 60, 1.2), circle(24, 40, 1.2), circle(-14, -60, 1.2), circle(14, -60, 1.2),
  )
  const boardG = solid(board, { depth: 0.8, bevel: 0.1, z: 1.3, bounds: [-36, -76, 36, 76] })
  const boardObjs = [mesh(boardG, [pcb, pcbEdge])]
  const die = (x, y, w, h, r, m, edge) => {
    const g = solid(rrect(x, y, w, h, r), { depth: 0.35, bevel: 0.05, z: 2.05, bounds: [x - w, y - h, x + w, y + h], step: 0.1 })
    return mesh(g, [m, edge])
  }
  boardObjs.push(die(8, 52, 11, 11, 1, satin, polished), die(-10, 50, 9, 9, 0.8, chip, polished), die(-12, 36, 8, 10, 0.8, chip, polished),
    die(14, 38, 6, 6, 0.6, chip, polished), die(6, -52, 8, 8, 0.7, chip, polished), die(-8, -56, 6, 6, 0.6, chip, polished))
  add('board', 'Logic board', `${thickness(boardG)} mm`, boardObjs, { lift: [0, 0, 18], order: 0.6, anchor: [-27, 27, 52, 2.3] })

  // Battery with a tab.
  const batt = smooth(2, rrect(0, -14, 54, 94, 5), capsule(-8, 34.5, 8, 34.5, 3.5))
  const battG = solid(batt, { depth: 2.8, bevel: 0.2, z: -1, bounds: [-36, -70, 36, 44] })
  add('battery', 'Battery', `${thickness(battG)} mm`, [mesh(battG, [foil, polished])], { lift: [0, 0, -20], order: 0.3, anchor: [-25, 25, -40, -1] })

  // Camera plate poking through the back glass, three lathed lens barrels.
  const plateG = solid(rrect(CAM.x, CAM.y, 29, 29, 8), { depth: 1.6, bevel: 0.25, z: -4.1, bounds: [CAM.x - 20, CAM.y - 20, CAM.x + 20, CAM.y + 20], step: 0.1 })
  const camObjs = [mesh(plateG, [satin, polished])]
  const faceZ = plateG.boundingBox.min.z
  const barrel = new THREE.LatheGeometry(
    [[5.4, 0], [5.5, 0.12], [5.5, 0.8], [5.2, 1], [4.4, 1], [4.15, 0.8], [4.15, 0.35]].map(([r, y]) => new THREE.Vector2(r, y)), 72,
  )
  const disc = (r, y) => new THREE.CircleGeometry(r, 56).rotateX(-Math.PI / 2).translate(0, y, 0)
  const lens = (lx, ly) => {
    const g = new THREE.Group()
    const ring = mesh(barrel, new THREE.MeshPhysicalMaterial({ color: '#d3d6dd', metalness: 1, roughness: 0.14, side: THREE.DoubleSide }))
    g.add(ring, mesh(disc(4.15, 0.35), lensGlass), mesh(disc(2.3, 0.37), new THREE.MeshPhysicalMaterial({ color: '#0a1030', metalness: 0, roughness: 0.05, clearcoat: 1, iridescence: 1, side: THREE.DoubleSide })))
    g.rotation.x = -Math.PI / 2
    g.position.set(CAM.x + lx, CAM.y + ly, faceZ)
    return g
  }
  camObjs.push(lens(-6.6, 6.6), lens(-6.6, -6.6), lens(6.6, 0))
  const dot = (lx, ly, r, color) => {
    const g = new THREE.Group()
    g.add(mesh(disc(r, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.2, side: THREE.DoubleSide })))
    g.rotation.x = -Math.PI / 2
    g.position.set(CAM.x + lx, CAM.y + ly, faceZ - 0.02)
    return g
  }
  camObjs.push(dot(6.6, 10.5, 1.8, '#e8e1c6'), dot(6.6, -10.5, 0.9, '#0a0c12'))
  add('camera', 'Camera', '3 lenses', camObjs, { lift: [0, 0, -34], order: 0.2, anchor: [CAM.x - 13, CAM.x + 13, CAM.y, faceZ - 1] })

  // Back glass with a cut-out for the camera plate.
  const backG = solid(subtract(rrect(0, 0, 68.4, 146.4, 9.6), rrect(CAM.x, CAM.y, 31.4, 31.4, 9.2)), { depth: 0.65, bevel: 0.12, z: -3.5, step: 0.2 })
  add('back', 'Back glass', `${thickness(backG)} mm`, [mesh(backG, [frosted, frostedEdge])], { lift: [0, 0, -58], order: 0.1, anchor: [-32, 32, -50, -3.9] })

  return { root, parts }
}
