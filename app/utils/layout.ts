import type { BlueprintsCollectionItem } from '@nuxt/content'

// --- Blueprint document (as authored) ---------------------------------------

export type Blueprint = BlueprintsCollectionItem
export type Resources = Blueprint['resources']
export type FurnitureResource = Resources['furniture'][string]
export type GroupResource = Resources['groups'][string]
export type RoomSpec = Resources['rooms'][string]
export type Template = Blueprint['templates'][number]
export type Placement = RoomSpec['furniture'][string]
export type GroupPlacement = RoomSpec['groups'][string]
export type Wall = RoomSpec['walls'][number]
export type Opening = RoomSpec['openings'][number]
export type Zone = RoomSpec['zones'][number]
export type Direction = NonNullable<Placement['facing']>
export type FurnitureType = FurnitureResource['type']
/** The clear space a piece asks for in its `clearance` field. */
export type ClearanceRule = NonNullable<FurnitureResource['clearance']>

// --- Resolved room (what the renderer and the conflict checks work on) ------

/**
 * A piece resolved into a room: type, size and clearance from its resource,
 * position from its placement. `x`/`y` is the top-left of the un-rotated
 * footprint, `rotation` turns it clockwise about its centre, and `facing`
 * is the front edge in the un-rotated frame (the resource's own facing).
 */
export interface Furniture {
  id: string
  /** Key of the furniture resource it was made from. */
  use: string
  type: FurnitureType
  label?: string
  x: number
  y: number
  width: number
  depth: number
  rotation: number
  facing?: Direction
  clearance?: ClearanceRule
  notes?: string
}

/** A group resolved into a room; items are in the group's un-rotated frame. */
export interface Group {
  id: string
  /** Key of the group resource it was made from. */
  use: string
  label?: string
  x: number
  y: number
  width: number
  depth: number
  rotation: number
  notes?: string
  /** Ids of the groups this one was composed from, if any. */
  groups: string[]
  /** Every piece of the group, nested groups flattened, in the group's un-rotated frame. */
  items: Furniture[]
}

/** One room of a blueprint with every placement resolved against the resources. */
export interface Room {
  /** Key of the room resource. */
  key: string
  title: string
  description?: string
  size: RoomSpec['size']
  walls: Wall[]
  openings: Opening[]
  zones: Zone[]
  furniture: Furniture[]
  groups: Group[]
  /** Placements that could not be resolved (unknown resource keys). */
  issues: string[]
}

/** A furniture item resolved to absolute room coordinates (group offset and rotation applied). */
export type Placed = Furniture & { group?: string }

/** Anything with a rotated rectangular footprint. */
export interface Box { x: number, y: number, width: number, depth: number, rotation?: number }

export type Pt = [number, number]

/** Tolerance in metres: pieces that merely touch are not in conflict. */
const EPS = 1e-3

// --- Footprints -----------------------------------------------------------

/** The four corners of a footprint, in metres, after rotation (clockwise on screen). */
export function footprintCorners(f: Box): Pt[] {
  const cx = f.x + f.width / 2
  const cy = f.y + f.depth / 2
  const a = ((f.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const hw = f.width / 2
  const hd = f.depth / 2
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Pt[]).map(([dx, dy]) => [
    cx + dx * cos - dy * sin,
    cy + dx * sin + dy * cos,
  ])
}

// --- Groups ---------------------------------------------------------------

/** The group's box in room coordinates (un-rotated). */
export function groupBox(g: Group): Required<Box> {
  return { x: g.x, y: g.y, width: g.width, depth: g.depth, rotation: g.rotation ?? 0 }
}

/**
 * Convert a group item to an absolute, stand-alone piece: its centre is
 * rotated around the group's centre and its rotation is added to the group's.
 */
export function placeGroupItem(g: Group, box: Required<Box>, i: Furniture): Placed {
  const gcx = box.x + box.width / 2
  const gcy = box.y + box.depth / 2
  const a = (box.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = g.x + i.x + i.width / 2 - gcx
  const dy = g.y + i.y + i.depth / 2 - gcy
  const cx = gcx + dx * cos - dy * sin
  const cy = gcy + dx * sin + dy * cos
  return {
    ...i,
    x: cx - i.width / 2,
    y: cy - i.depth / 2,
    rotation: (i.rotation ?? 0) + box.rotation,
    group: g.id,
  }
}

/** Every piece in the room, loose or grouped, in absolute coordinates. */
export function placeFurniture(room: Room): Placed[] {
  return [
    ...room.furniture,
    ...room.groups.flatMap(g => {
      const box = groupBox(g)
      return g.items.map(i => placeGroupItem(g, box, i))
    }),
  ]
}

// --- Polygon helpers ------------------------------------------------------

function signedArea(poly: Pt[]) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/** Sutherland–Hodgman: the part of convex `subject` that lies inside convex `clip`. */
export function clipPolygon(subject: Pt[], clip: Pt[]): Pt[] {
  const sign = Math.sign(signedArea(clip)) || 1
  let output = subject
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const inside = (p: Pt) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9
    const intersect = (p: Pt, q: Pt): Pt => {
      const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
      const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
      const t = d1 / (d1 - d2)
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    }
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!
      const prev = input[(j + input.length - 1) % input.length]!
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur))
        output.push(cur)
      } else if (inside(prev)) {
        output.push(intersect(prev, cur))
      }
    }
  }
  return output
}

/**
 * Separating-axis test for two convex polygons. Returns the penetration
 * depth in metres (smallest overlap over all edge normals), or 0 when the
 * shapes are apart or only touching.
 */
export function penetrationDepth(a: Pt[], b: Pt[]): number {
  let depth = Infinity
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % poly.length]!
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
      const nx = (q[1] - p[1]) / len
      const ny = -(q[0] - p[0]) / len
      const pa = a.map(c => c[0] * nx + c[1] * ny)
      const pb = b.map(c => c[0] * nx + c[1] * ny)
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))
      if (overlap <= EPS) return 0
      depth = Math.min(depth, overlap)
    }
  }
  return depth
}

function pointInPolygon(p: Pt, poly: Pt[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Signed distance from `p` to the interior line of `w`, positive on the outward side. */
function outwardDistance(p: Pt, w: Wall) {
  const dx = w.to[0] - w.from[0]
  const dy = w.to[1] - w.from[1]
  const len = Math.hypot(dx, dy) || 1
  // Clockwise walls in screen coords: outward normal is to the left of travel.
  return ((p[0] - w.from[0]) * dy - (p[1] - w.from[1]) * dx) / len
}

/** A large quad covering the outside of wall `w`, for clipping "what lies past this wall". */
function outsideOfWall(w: Wall): Pt[] {
  const dx = w.to[0] - w.from[0]
  const dy = w.to[1] - w.from[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = uy
  const ny = -ux
  const R = 100
  const a: Pt = [w.from[0] - ux * R, w.from[1] - uy * R]
  const b: Pt = [w.to[0] + ux * R, w.to[1] + uy * R]
  return [a, b, [b[0] + nx * R, b[1] + ny * R], [a[0] + nx * R, a[1] + ny * R]]
}

/** Corners of `pts` that lie outside the interior polygon (not merely on a wall line). */
function outsideCorners(pts: Pt[], room: Room, interior: Pt[]) {
  return pts.filter(p =>
    !pointInPolygon(p, interior) && room.walls.every(w => distToSegment(p, w.from as Pt, w.to as Pt) > EPS),
  )
}

/** For each wall some of `outside` reaches past, how far the furthest point reaches. */
function breachesByWall(outside: Pt[], room: Room) {
  const byWall = new Map<string, { wall: Wall, depth: number }>()
  for (const p of outside) {
    // Attribute each point to the wall it reaches furthest past.
    let worst = { wall: room.walls[0]!, depth: -Infinity }
    for (const w of room.walls) {
      const d = outwardDistance(p, w)
      if (d > worst.depth) worst = { wall: w, depth: d }
    }
    const cur = byWall.get(worst.wall.id)
    if (!cur || worst.depth > cur.depth) byWall.set(worst.wall.id, worst)
  }
  return [...byWall.values()]
}

// --- Clearance rules --------------------------------------------------------

const FACING_DIR: Record<NonNullable<Furniture['facing']>, Pt> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
}

/**
 * The clearance rule that applies to a piece, or null when none does: the
 * piece must declare `clearance` and have a `facing` to measure it from.
 */
export function clearanceRule(f: Furniture): ClearanceRule | null {
  const rule = f.clearance
  if (!rule || !f.facing || rule.distance <= EPS) return null
  return { ...rule, side: rule.side ?? 'front', label: rule.label ?? rule.side ?? 'front' }
}

/**
 * The clear-space zone of a piece: a strip `rule.distance` deep along the
 * `facing` edge (or the opposite edge), rotated with the piece. Clockwise on
 * screen, in metres.
 */
export function clearanceZone(f: Furniture, rule: ClearanceRule): Pt[] {
  const [dx, dy] = FACING_DIR[f.facing ?? 'south']
  const dir: Pt = rule.side === 'front' ? [dx, dy] : [-dx, -dy]
  // Un-rotated footprint corners, clockwise.
  const local: Pt[] = [[f.x, f.y], [f.x + f.width, f.y], [f.x + f.width, f.y + f.depth], [f.x, f.y + f.depth]]
  const proj = local.map(c => c[0] * dir[0] + c[1] * dir[1])
  const max = Math.max(...proj)
  const [e0, e1] = local.filter((_, i) => max - proj[i]! < 1e-9) as [Pt, Pt]
  const d = rule.distance
  const zone: Pt[] = [e0, e1, [e1[0] + dir[0] * d, e1[1] + dir[1] * d], [e0[0] + dir[0] * d, e0[1] + dir[1] * d]]
  // Rotate with the piece, about the footprint's centre.
  const cx = f.x + f.width / 2
  const cy = f.y + f.depth / 2
  const a = ((f.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return zone.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos])
}

// --- Conflicts ------------------------------------------------------------

export type Conflict =
  | {
    kind: 'overlap'
    /** ids of the two pieces involved. */
    ids: [string, string]
    message: string
    /** Overlapping region, in metres. */
    region: Pt[]
    /** Penetration depth in metres. */
    depth: number
  }
  | {
    kind: 'wall'
    ids: [string]
    message: string
    /** Corners that lie outside the interior, in metres. */
    points: Pt[]
    /** How far past the wall the piece reaches, in metres. */
    depth: number
    wall: string
  }
  | {
    kind: 'clearance'
    /** The piece whose clear space is taken, then the intruding piece if any. */
    ids: [string] | [string, string]
    message: string
    /** The clear space the piece needs, as a polygon in metres. */
    zone: Pt[]
    /** The part of the zone that is taken by the other piece or lies past the wall. */
    region: Pt[]
    /** How far the intruder or the wall cuts into the zone, in metres. */
    depth: number
    /** Clear depth required, in metres. */
    required: number
    /** Set when the zone runs into a wall rather than a piece. */
    wall?: string
  }

const name = (f: Furniture) => f.label ?? f.type

/** Surfaces a `tv` is allowed to stand on, so the two are not reported as a clash. */
const TV_SURFACES = new Set<FurnitureType>(['tv-unit', 'dresser', 'table', 'desk', 'bookcase'])

/** Pairs that are allowed to share floor space: rugs under anything, a TV on its unit. */
function mayOverlap(a: Furniture, b: Furniture) {
  if (a.type === 'rug' || b.type === 'rug') return true
  if (a.type === 'tv' && TV_SURFACES.has(b.type)) return true
  if (b.type === 'tv' && TV_SURFACES.has(a.type)) return true
  return false
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Every conflict in a room:
 * - pieces overlapping each other (rugs are allowed under anything, a TV may
 *   stand on its unit);
 * - pieces reaching past the interior walls;
 * - clear space a piece declares on its working side (`clearance`: bed foot,
 *   wardrobe doors, desk chair) taken by another piece or cut off by a wall.
 * Items inside a group are checked like any other piece.
 */
export function detectConflicts(room: Room): Conflict[] {
  const pieces = placeFurniture(room)
  const corners = new Map(pieces.map(f => [f.id, footprintCorners(f)] as const))
  const interior: Pt[] = room.walls.map(w => w.from as Pt)
  const out: Conflict[] = []

  // Pieces against the walls.
  for (const f of pieces) {
    const outside = outsideCorners(corners.get(f.id)!, room, interior)
    if (!outside.length) continue
    // Attribute the breach to the wall the corners reach furthest past.
    const worst = breachesByWall(outside, room).sort((a, b) => b.depth - a.depth)[0]!
    out.push({
      kind: 'wall',
      ids: [f.id],
      wall: worst.wall.id,
      depth: worst.depth,
      points: outside,
      message: `${name(f)} reaches ${worst.depth.toFixed(2)} m past the ${worst.wall.id} wall`,
    })
  }

  // Pieces against each other.
  const overlapping = new Set<string>()
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i]!
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j]!
      if (mayOverlap(a, b)) continue
      const ca = corners.get(a.id)!
      const cb = corners.get(b.id)!
      const depth = penetrationDepth(ca, cb)
      if (!depth) continue
      overlapping.add(pairKey(a.id, b.id))
      out.push({
        kind: 'overlap',
        ids: [a.id, b.id],
        depth,
        region: clipPolygon(ca, cb),
        message: `${name(a)} overlaps ${name(b)} by ${depth.toFixed(2)} m`,
      })
    }
  }

  // Clear space on the working side of a piece.
  for (const f of pieces) {
    const rule = clearanceRule(f)
    if (!rule) continue
    const zone = clearanceZone(f, rule)
    const need = `${rule.distance.toFixed(2)} m clear at its ${rule.label}`

    for (const { wall, depth } of breachesByWall(outsideCorners(zone, room, interior), room)) {
      out.push({
        kind: 'clearance',
        ids: [f.id],
        wall: wall.id,
        zone,
        region: clipPolygon(zone, outsideOfWall(wall)),
        depth,
        required: rule.distance,
        message: `${name(f)} needs ${need}, but the ${wall.id} wall cuts ${depth.toFixed(2)} m off that space`,
      })
    }

    for (const g of pieces) {
      if (g.id === f.id || g.type === 'rug' || rule.allows?.includes(g.type)) continue
      // A piece that already overlaps is reported once, as an overlap.
      if (overlapping.has(pairKey(f.id, g.id))) continue
      const cg = corners.get(g.id)!
      const depth = penetrationDepth(zone, cg)
      if (!depth) continue
      out.push({
        kind: 'clearance',
        ids: [f.id, g.id],
        zone,
        region: clipPolygon(zone, cg),
        depth,
        required: rule.distance,
        message: `${name(f)} needs ${need}, but ${name(g)} sits ${depth.toFixed(2)} m inside that space`,
      })
    }
  }

  return out
}

/** ids of every piece involved in at least one conflict. */
export function conflictingIds(conflicts: Conflict[]): Set<string> {
  return new Set(conflicts.flatMap(c => c.ids))
}

// --- Resolving a blueprint into rooms ------------------------------------

/** Clockwise angle, in degrees, from `south` to each direction. */
const FACING_ANGLE: Record<Direction, number> = { south: 0, west: 90, north: 180, east: 270 }

const normDeg = (a: number) => ((a % 360) + 360) % 360
const tidy = (v: number) => Math.round(v * 1e6) / 1e6

/** Size of the axis-aligned bounding box of a `width` × `depth` footprint rotated by `deg`. */
export function rotatedExtent(width: number, depth: number, deg: number) {
  const a = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return { width: width * c + depth * s, depth: width * s + depth * c }
}

/**
 * Placements give the top-left of the space a piece occupies after rotation;
 * the geometry works with the top-left of the un-rotated footprint. Both
 * share the same centre.
 */
function unrotatedTopLeft(x: number, y: number, width: number, depth: number, rotation: number): Pt {
  const ext = rotatedExtent(width, depth, rotation)
  return [tidy(x + ext.width / 2 - width / 2), tidy(y + ext.depth / 2 - depth / 2)]
}

/** `key` is the placement's map key (the default resource key); `id` is unique within the room. */
function resolvePiece(id: string, key: string, p: Placement, resources: Resources, issues: string[]): Furniture | null {
  const use = p.use ?? key
  const r = resources.furniture[use]
  if (!r) {
    issues.push(`"${id}" uses furniture "${use}", which is not in the resources`)
    return null
  }
  const base = r.facing ?? 'south'
  const turn = p.facing ? FACING_ANGLE[p.facing] - FACING_ANGLE[base] : 0
  const rotation = normDeg(turn + (p.rotation ?? 0))
  const [x, y] = unrotatedTopLeft(p.x, p.y, r.size.width, r.size.depth, rotation)
  return {
    id,
    use,
    type: r.type,
    label: r.label,
    x,
    y,
    width: r.size.width,
    depth: r.size.depth,
    rotation,
    facing: r.facing,
    clearance: r.clearance,
    notes: p.notes ?? r.notes,
  }
}

/**
 * Resolve a group placement into a flat list of pieces in the parent frame.
 * Nested groups are resolved first in their own frame, then their items are
 * moved and turned into this group's frame, so the result only holds pieces.
 * `stack` holds the group keys being resolved, to stop a group that contains itself.
 */
function resolveGroup(id: string, gp: GroupPlacement, resources: Resources, issues: string[], stack: string[] = []): Group | null {
  const use = gp.use ?? id
  const r = resources.groups?.[use]
  if (!r) {
    issues.push(`"${id}" uses group "${use}", which is not in the resources`)
    return null
  }
  if (stack.includes(use)) {
    issues.push(`group "${use}" contains itself (${[...stack, use].join(' > ')})`)
    return null
  }
  const items = Object.entries(r.items ?? {})
    .map(([key, p]) => resolvePiece(`${id}/${key}`, key, p, resources, issues))
    .filter((f): f is Furniture => f !== null)
  const groups = Object.entries(r.groups ?? {})
    .map(([key, g]) => resolveGroup(`${id}/${key}`, { ...g, use: g.use ?? key }, resources, issues, [...stack, use]))
    .filter((g): g is Group => g !== null)
  for (const g of groups) {
    const box = groupBox(g)
    for (const i of g.items) {
      const { group: _, ...piece } = placeGroupItem(g, box, i)
      items.push(piece)
    }
  }
  // Box: as declared, or the items' extent from the group origin.
  const corners = items.flatMap(footprintCorners)
  const width = r.size?.width ?? Math.max(0, ...corners.map(c => c[0]))
  const depth = r.size?.depth ?? Math.max(0, ...corners.map(c => c[1]))
  const rotation = normDeg(gp.rotation ?? 0)
  const [x, y] = unrotatedTopLeft(gp.x, gp.y, width, depth, rotation)
  return { id, use, label: r.label, x, y, width, depth, rotation, notes: gp.notes ?? r.notes, groups: groups.map(g => g.id), items }
}

/** One room of a blueprint with its placements resolved against the resources, or null if the key is unknown. */
export function resolveRoom(doc: Blueprint, key: string): Room | null {
  const spec = doc.resources.rooms?.[key]
  if (!spec) return null
  const issues: string[] = []
  const furniture = Object.entries(spec.furniture ?? {})
    .map(([id, p]) => resolvePiece(id, id, p, doc.resources, issues))
    .filter((f): f is Furniture => f !== null)
  const groups = Object.entries(spec.groups ?? {})
    .map(([id, g]) => resolveGroup(id, g, doc.resources, issues))
    .filter((g): g is Group => g !== null)
  return {
    key,
    title: spec.title,
    description: spec.description,
    size: spec.size,
    walls: spec.walls,
    openings: spec.openings ?? [],
    zones: spec.zones ?? [],
    furniture,
    groups,
    issues,
  }
}

/** Every room resource of a blueprint, in document order, whether or not a template shows it. */
export function resolveRooms(doc: Blueprint): Room[] {
  return Object.keys(doc.resources.rooms ?? {}).map(k => resolveRoom(doc, k)!)
}

/**
 * The room a template shows, under the template's own title and description
 * when it sets them, or null when the template points at an unknown room.
 */
export function resolveTemplate(doc: Blueprint, template: Template): Room | null {
  const room = resolveRoom(doc, template.room)
  if (!room) return null
  return { ...room, title: template.title ?? room.title, description: template.description ?? room.description }
}

/** Every template of a blueprint in order, skipping those whose room is unknown. */
export function resolveTemplates(doc: Blueprint): Room[] {
  return doc.templates.map(t => resolveTemplate(doc, t)).filter((r): r is Room => r !== null)
}
