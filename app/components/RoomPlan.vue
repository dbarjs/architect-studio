<script setup lang="ts">
import type { Box, Furniture, Opening, Placed, Pt, Room, Wall } from '~/utils/layout'
import { clearanceRule, clearanceZone, conflictingIds, detectConflicts, footprintCorners, groupBox, placeFurniture } from '~/utils/layout'

const props = defineProps<{ room: Room }>()

/** Pixels per metre in SVG user units. */
const SCALE = 100
/** Margin around the walls, in metres, for dimension labels. */
const MARGIN = 0.8

const m = (v: number) => v * SCALE

const canvas = computed(() => ({
  width: m(props.room.size.width + MARGIN * 2),
  height: m(props.room.size.depth + MARGIN * 2),
}))

const gridLines = computed(() => {
  const xs = Array.from({ length: Math.floor(props.room.size.width) + 1 }, (_, i) => i)
  const ys = Array.from({ length: Math.floor(props.room.size.depth) + 1 }, (_, i) => i)
  return { xs, ys }
})

// --- Walls -------------------------------------------------------------

function wallVector(w: Wall) {
  const dx = w.to[0] - w.from[0]
  const dy = w.to[1] - w.from[1]
  const len = Math.hypot(dx, dy) || 1
  return { dx, dy, len, ux: dx / len, uy: dy / len }
}

/** Outward normal of a wall, assuming walls are listed clockwise around the interior. */
function outwardNormal(w: Wall) {
  const { ux, uy } = wallVector(w)
  // Clockwise in screen coords (y down): outward is to the left of travel.
  return { nx: uy, ny: -ux }
}

/** Polygon for a wall's thickness band, from the interior line outwards. */
function wallPolygon(w: Wall) {
  const { nx, ny } = outwardNormal(w)
  const { ux, uy } = wallVector(w)
  const t = w.thickness
  // Extend ends by thickness so corners join cleanly.
  const a = [w.from[0] - ux * t, w.from[1] - uy * t]
  const b = [w.to[0] + ux * t, w.to[1] + uy * t]
  const pts = [
    a,
    b,
    [b[0] + nx * t, b[1] + ny * t],
    [a[0] + nx * t, a[1] + ny * t],
  ]
  return pts.map(([x, y]) => `${m(x)},${m(y)}`).join(' ')
}

const wallsById = computed(() => Object.fromEntries(props.room.walls.map(w => [w.id, w])))

// --- Openings ----------------------------------------------------------

interface PlacedOpening {
  opening: Opening
  /** Start and end points along the interior wall line. */
  a: [number, number]
  b: [number, number]
  /** Outward normal. */
  n: { nx: number, ny: number }
  thickness: number
  /** Hinge point and swing end for doors. */
  hinge: [number, number]
  swingDir: 1 | -1
}

const placedOpenings = computed<PlacedOpening[]>(() => {
  return props.room.openings.flatMap((o) => {
    const w = wallsById.value[o.wall]
    if (!w) return []
    const { ux, uy } = wallVector(w)
    const n = outwardNormal(w)
    const a: [number, number] = [w.from[0] + ux * o.offset, w.from[1] + uy * o.offset]
    const b: [number, number] = [a[0] + ux * o.width, a[1] + uy * o.width]
    const swingRight = o.swing === 'right'
    return [{
      opening: o,
      a,
      b,
      n,
      thickness: w.thickness,
      hinge: swingRight ? b : a,
      swingDir: swingRight ? -1 : 1,
    }]
  })
})

/** SVG path for a door leaf (into the room) plus its quarter-circle swing arc. */
function doorPath(p: PlacedOpening) {
  const { hinge, n, opening, swingDir } = p
  const r = opening.width
  // Inward direction = negative outward normal.
  const inx = -n.nx
  const iny = -n.ny
  const leafEnd: [number, number] = [hinge[0] + inx * r, hinge[1] + iny * r]
  const other = swingDir === 1 ? p.b : p.a
  const sweep = swingDir === 1 ? 0 : 1
  // Arc from leaf end back to the other jamb.
  return [
    `M ${m(hinge[0])} ${m(hinge[1])}`,
    `L ${m(leafEnd[0])} ${m(leafEnd[1])}`,
    `A ${m(r)} ${m(r)} 0 0 ${sweep} ${m(other[0])} ${m(other[1])}`,
  ].join(' ')
}

/** Rectangle for a window within the wall band. */
function windowRect(p: PlacedOpening) {
  const { a, b, n, thickness } = p
  const pts = [
    a,
    b,
    [b[0] + n.nx * thickness, b[1] + n.ny * thickness],
    [a[0] + n.nx * thickness, a[1] + n.ny * thickness],
  ]
  return pts.map(([x, y]) => `${m(x!)},${m(y!)}`).join(' ')
}

function windowCentreLine(p: PlacedOpening) {
  const { a, b, n, thickness } = p
  const h = thickness / 2
  return {
    x1: m(a[0] + n.nx * h),
    y1: m(a[1] + n.ny * h),
    x2: m(b[0] + n.nx * h),
    y2: m(b[1] + n.ny * h),
  }
}

// --- Furniture ---------------------------------------------------------

const FURNITURE_FILL: Record<Furniture['type'], string> = {
  'bed': '#dbeafe',
  'nightstand': '#e0e7ff',
  'wardrobe': '#e9d5ff',
  'dresser': '#e9d5ff',
  'desk': '#fef3c7',
  'chair': '#fde68a',
  'bookcase': '#fed7aa',
  'sofa': '#d1fae5',
  'armchair': '#d1fae5',
  'coffee-table': '#ecfccb',
  'tv-unit': '#e5e7eb',
  'tv': '#111827',
  'table': '#fef3c7',
  'rug': '#f5f5f4',
  'plant': '#bbf7d0',
  'divider': '#78716c',
  'other': '#f3f4f6',
}

// --- Groups ------------------------------------------------------------

const groupBoxes = computed(() => props.room.groups.map(g => ({ group: g, box: groupBox(g) })))

/** Every piece in the room, loose or grouped, in absolute coordinates. */
const placedFurniture = computed<Placed[]>(() => placeFurniture(props.room))

/** Rugs render under everything else, so sort them first. */
const orderedFurniture = computed(() =>
  [...placedFurniture.value].sort((a, b) => Number(a.type !== 'rug') - Number(b.type !== 'rug')),
)

function boxTransform(b: Box) {
  if (!b.rotation) return undefined
  const cx = m(b.x + b.width / 2)
  const cy = m(b.y + b.depth / 2)
  return `rotate(${b.rotation} ${cx} ${cy})`
}

function furnitureTransform(f: Furniture) {
  if (!f.rotation) return undefined
  const cx = m(f.x + f.width / 2)
  const cy = m(f.y + f.depth / 2)
  return `rotate(${f.rotation} ${cx} ${cy})`
}

/** Types whose orientation matters enough to draw an arrow for. */
const ARROW_TYPES = new Set<Furniture['type']>(['sofa', 'armchair', 'chair', 'desk'])

/** Short arrow from the centre toward the `facing` edge. */
function facingArrow(f: Furniture) {
  if (!f.facing || !ARROW_TYPES.has(f.type)) return null
  const cx = f.x + f.width / 2
  const cy = f.y + f.depth / 2
  const len = Math.min(f.width, f.depth) * 0.3
  const dir = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[f.facing]
  return { x1: m(cx), y1: m(cy), x2: m(cx + dir[0]! * len), y2: m(cy + dir[1]! * len) }
}

const fontSize = (f: Furniture) => Math.max(9, Math.min(13, Math.min(f.width, f.depth) * SCALE * 0.22))

/**
 * Label orientation: along the long side of elongated pieces, horizontal on
 * screen for near-square ones, and never upside down.
 */
function labelTransform(f: Furniture) {
  const r = f.rotation ?? 0
  const norm = (a: number) => ((a % 360) + 360) % 360
  const elongated = f.depth > f.width * 1.5 || f.width > f.depth * 1.5
  let angle = elongated ? (f.depth > f.width ? -90 : 0) : -r
  const onScreen = norm(r + angle)
  if (onScreen > 90 && onScreen <= 270) angle += 180
  if (!norm(angle)) return undefined
  return `rotate(${angle} ${m(f.x + f.width / 2)} ${m(f.y + f.depth / 2)})`
}

// --- Hover: clearances to the walls ------------------------------------

/** id of the hovered loose piece, or of the hovered group (groups hover as one unit). */
const hovered = ref<string | null>(null)
const hoverKey = (f: Placed) => f.group ?? f.id
const isHovered = (f: Placed) => hovered.value !== null && hovered.value === hoverKey(f)

/** Distance along a ray from `p` in direction `dir` to the nearest wall interior line. */
function rayToWalls(p: Pt, dir: Pt): number | null {
  let best: number | null = null
  for (const w of props.room.walls) {
    const ex = w.to[0] - w.from[0]
    const ey = w.to[1] - w.from[1]
    const denom = dir[0] * ey - dir[1] * ex
    if (Math.abs(denom) < 1e-9) continue
    const fx = w.from[0] - p[0]
    const fy = w.from[1] - p[1]
    const t = (fx * ey - fy * ex) / denom
    const u = (fx * dir[1] - fy * dir[0]) / denom
    if (t >= -1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t
  }
  return best
}

const DIRECTIONS: { key: string, dir: Pt }[] = [
  { key: 'north', dir: [0, -1] },
  { key: 'east', dir: [1, 0] },
  { key: 'south', dir: [0, 1] },
  { key: 'west', dir: [-1, 0] },
]

interface Clearance {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  lx: number
  ly: number
}

/**
 * For the hovered piece or group: one dashed line per direction, from the
 * outermost point on that side straight to the wall, labelled in metres.
 * When a whole edge is outermost (no rotation) the line starts at its middle.
 * A group is measured from its actual items, not from its box.
 */
const clearances = computed<Clearance[]>(() => {
  if (hovered.value === null) return []
  const pieces = placedFurniture.value.filter(f => hoverKey(f) === hovered.value)
  if (!pieces.length) return []
  const corners = pieces.flatMap(footprintCorners)
  const out: Clearance[] = []
  for (const { key, dir } of DIRECTIONS) {
    const proj = corners.map(c => c[0] * dir[0] + c[1] * dir[1])
    const max = Math.max(...proj)
    const extreme = corners.filter((_, i) => max - proj[i]! < 1e-6)
    const start: Pt = [
      extreme.reduce((s, c) => s + c[0], 0) / extreme.length,
      extreme.reduce((s, c) => s + c[1], 0) / extreme.length,
    ]
    const dist = rayToWalls(start, dir)
    if (dist === null || dist < 0.005) continue
    const end: Pt = [start[0] + dir[0] * dist, start[1] + dir[1] * dist]
    const mid: Pt = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    // Nudge the label off the line, perpendicular to it.
    const off = 0.14
    out.push({
      key,
      x1: m(start[0]), y1: m(start[1]), x2: m(end[0]), y2: m(end[1]),
      label: `${dist.toFixed(2)} m`,
      lx: m(mid[0] + (dir[0] === 0 ? off : 0)),
      ly: m(mid[1] + (dir[1] === 0 ? -off : 0)),
    })
  }
  return out
})

const polygonPoints = (pts: Pt[]) => pts.map(([x, y]) => `${m(x)},${m(y)}`).join(' ')

/** Clear-space zones (bed foot, wardrobe doors, desk chair) of the hovered piece or group. */
const hoverZones = computed(() => {
  if (hovered.value === null) return []
  return placedFurniture.value
    .filter(f => hoverKey(f) === hovered.value)
    .flatMap((f) => {
      const rule = clearanceRule(f)
      if (!rule) return []
      const zone = clearanceZone(f, rule)
      const cx = zone.reduce((s, c) => s + c[0], 0) / zone.length
      const cy = zone.reduce((s, c) => s + c[1], 0) / zone.length
      return [{ id: f.id, points: polygonPoints(zone), lx: m(cx), ly: m(cy), label: `${rule.label} ${rule.distance.toFixed(1)} m` }]
    })
})

// --- Conflicts: overlaps, pieces through the walls, clear space taken ----

const conflicts = computed(() => detectConflicts(props.room))
const conflictIds = computed(() => conflictingIds(conflicts.value))
const inConflict = (f: Placed) => conflictIds.value.has(f.id)

function furnitureStroke(f: Placed) {
  if (isHovered(f)) return { stroke: '#2563eb', width: 2.5 }
  if (inConflict(f)) return { stroke: '#dc2626', width: 2.5 }
  if (f.type === 'rug') return { stroke: '#d6d3d1', width: 1 }
  return { stroke: '#374151', width: 1.5 }
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
    :width="canvas.width"
    :height="canvas.height"
    class="w-full h-auto max-h-[80vh] select-none"
    font-family="ui-sans-serif, system-ui, sans-serif"
  >
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
      </marker>
      <pattern id="conflict-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#fecaca" fill-opacity="0.85" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#dc2626" stroke-width="2" />
      </pattern>
    </defs>

    <g :transform="`translate(${m(MARGIN)} ${m(MARGIN)})`">
    <!-- Floor -->
    <rect :x="0" :y="0" :width="m(room.size.width)" :height="m(room.size.depth)" fill="#fafaf9" />

    <!-- 1 m grid -->
    <g stroke="#e7e5e4" stroke-width="1">
      <line v-for="x in gridLines.xs" :key="`gx${x}`" :x1="m(x)" :y1="0" :x2="m(x)" :y2="m(room.size.depth)" />
      <line v-for="y in gridLines.ys" :key="`gy${y}`" :x1="0" :y1="m(y)" :x2="m(room.size.width)" :y2="m(y)" />
    </g>

    <!-- Zones -->
    <g v-for="z in room.zones" :key="z.id">
      <rect
        :x="m(z.x)" :y="m(z.y)" :width="m(z.width)" :height="m(z.depth)"
        fill="none" stroke="#a8a29e" stroke-width="1.5" stroke-dasharray="6 5" rx="4"
      />
      <text :x="m(z.x) + 8" :y="m(z.y) + 16" font-size="11" fill="#78716c" text-transform="uppercase" letter-spacing="1">
        {{ z.label.toUpperCase() }}
      </text>
    </g>

    <!-- Group boxes: a thin dashed outline around each unit, stronger when hovered -->
    <g v-for="{ group: g, box } in groupBoxes" :key="g.id" :transform="boxTransform(box)" pointer-events="none">
      <rect
        :x="m(box.x)" :y="m(box.y)" :width="m(box.width)" :height="m(box.depth)"
        fill="none"
        :stroke="hovered === g.id ? '#2563eb' : '#a5b4fc'"
        :stroke-width="hovered === g.id ? 1.5 : 1"
        stroke-dasharray="3 3" rx="3"
      />
    </g>

    <!-- Furniture -->
    <g
      v-for="f in orderedFurniture" :key="f.id" :transform="furnitureTransform(f)"
      class="cursor-pointer"
      @mouseenter="hovered = hoverKey(f)" @mouseleave="hovered = null"
    >
      <rect
        :x="m(f.x)" :y="m(f.y)" :width="m(f.width)" :height="m(f.depth)"
        :fill="FURNITURE_FILL[f.type]"
        :stroke="furnitureStroke(f).stroke"
        :stroke-width="furnitureStroke(f).width"
        :stroke-dasharray="f.type === 'rug' ? '4 3' : undefined"
        rx="2"
      >
        <title>{{ f.label ?? f.type }} — {{ f.width }} × {{ f.depth }} m</title>
      </rect>
      <!-- Bed: mark the pillows on the side opposite to `facing` -->
      <template v-if="f.type === 'bed'">
        <rect
          v-if="f.facing === 'west' || f.facing === 'east'"
          :x="m(f.facing === 'west' ? f.x + f.width - 0.4 : f.x + 0.1)" :y="m(f.y + 0.15)"
          :width="m(0.3)" :height="m(f.depth - 0.3)" fill="#fff" stroke="#374151" stroke-width="1" rx="4"
        />
        <rect
          v-else
          :x="m(f.x + 0.15)" :y="m(f.facing === 'north' ? f.y + f.depth - 0.4 : f.y + 0.1)"
          :width="m(f.width - 0.3)" :height="m(0.3)" fill="#fff" stroke="#374151" stroke-width="1" rx="4"
        />
      </template>
      <line
        v-if="facingArrow(f)"
        v-bind="facingArrow(f)!"
        stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrow)"
      />
      <text
        v-if="f.type !== 'tv'"
        :x="m(f.x + f.width / 2)" :y="m(f.y + f.depth / 2)"
        :font-size="fontSize(f)"
        :fill="f.type === 'rug' ? '#a8a29e' : '#1f2937'"
        text-anchor="middle" dominant-baseline="middle"
        :dy="facingArrow(f) ? -fontSize(f) * 0.9 : 0"
        :transform="labelTransform(f)"
      >
        {{ f.label ?? f.type }}
      </text>
    </g>

    <!-- Walls -->
    <g fill="#1f2937" stroke="#1f2937" stroke-width="1" stroke-linejoin="miter">
      <polygon v-for="w in room.walls" :key="w.id" :points="wallPolygon(w)" />
    </g>

    <!-- Openings -->
    <g v-for="(p, i) in placedOpenings" :key="i">
      <template v-if="p.opening.type === 'window'">
        <polygon :points="windowRect(p)" fill="#f0f9ff" stroke="#1f2937" stroke-width="1" />
        <line v-bind="windowCentreLine(p)" stroke="#1f2937" stroke-width="1" />
      </template>
      <template v-else>
        <polygon :points="windowRect(p)" fill="#fafaf9" stroke="none" />
        <path :d="doorPath(p)" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-dasharray="0" />
      </template>
    </g>

    <!-- Conflicts: hatched overlap regions, corners poking through walls, clear space taken -->
    <g v-if="conflicts.length" pointer-events="none">
      <template v-for="(c, i) in conflicts" :key="i">
        <polygon
          v-if="c.kind === 'overlap' && c.region.length"
          :points="polygonPoints(c.region)"
          fill="url(#conflict-hatch)" stroke="#dc2626" stroke-width="1.5"
        />
        <template v-else-if="c.kind === 'wall'">
          <circle v-for="(p, j) in c.points" :key="j" :cx="m(p[0])" :cy="m(p[1])" r="5" fill="#dc2626" stroke="#fff" stroke-width="1.5" />
        </template>
        <template v-else-if="c.kind === 'clearance'">
          <polygon :points="polygonPoints(c.zone)" fill="#fecaca" fill-opacity="0.3" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 4" />
          <polygon v-if="c.region.length" :points="polygonPoints(c.region)" fill="url(#conflict-hatch)" stroke="#dc2626" stroke-width="1.5" />
        </template>
      </template>
    </g>

    <!-- Clear space the hovered piece needs -->
    <g v-if="hoverZones.length" pointer-events="none" font-size="11" font-weight="600">
      <template v-for="z in hoverZones" :key="z.id">
        <polygon :points="z.points" fill="#dbeafe" fill-opacity="0.35" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="6 4" />
        <text :x="z.lx" :y="z.ly" fill="#1d4ed8" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">{{ z.label }}</text>
      </template>
    </g>

    <!-- Clearances to the walls for the hovered piece -->
    <g v-if="clearances.length" pointer-events="none" font-size="11" font-weight="600">
      <template v-for="c in clearances" :key="c.key">
        <line :x1="c.x1" :y1="c.y1" :x2="c.x2" :y2="c.y2" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="5 4" />
        <circle :cx="c.x1" :cy="c.y1" r="2.5" fill="#2563eb" />
        <text
          :x="c.lx" :y="c.ly" fill="#1d4ed8" stroke="#fff" stroke-width="3" paint-order="stroke"
          text-anchor="middle" dominant-baseline="middle"
        >{{ c.label }}</text>
      </template>
    </g>

    <!-- Dimensions -->
    <g stroke="#9ca3af" stroke-width="1" fill="#6b7280" font-size="12">
      <line :x1="0" :y1="m(-MARGIN * 0.55)" :x2="m(room.size.width)" :y2="m(-MARGIN * 0.55)" marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <text :x="m(room.size.width / 2)" :y="m(-MARGIN * 0.55) - 6" text-anchor="middle" stroke="none">{{ room.size.width }} m</text>
      <line :x1="m(-MARGIN * 0.55)" :y1="0" :x2="m(-MARGIN * 0.55)" :y2="m(room.size.depth)" marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <text
        :x="m(-MARGIN * 0.55) - 6" :y="m(room.size.depth / 2)" text-anchor="middle" stroke="none"
        :transform="`rotate(-90 ${m(-MARGIN * 0.55) - 6} ${m(room.size.depth / 2)})`"
      >{{ room.size.depth }} m</text>
    </g>

    <!-- North arrow -->
    <g :transform="`translate(${m(room.size.width + MARGIN * 0.5)} ${m(-MARGIN * 0.5)})`" fill="#6b7280" font-size="11">
      <line x1="0" y1="14" x2="0" y2="-10" stroke="#6b7280" stroke-width="1.5" marker-end="url(#arrow)" />
      <text x="0" y="28" text-anchor="middle">N</text>
    </g>
    </g>
  </svg>
</template>
