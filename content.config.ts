import { defineCollection, defineContentConfig, z } from '@nuxt/content'

/**
 * A point in metres. Origin is the room's top-left interior corner,
 * x grows to the right (east), y grows downwards (south) in the top view.
 */
const point = z.tuple([z.number(), z.number()])

const direction = z.enum(['north', 'south', 'east', 'west'])

/** Footprint in metres: width along x, depth along y. */
const size = z.object({ width: z.number(), depth: z.number() })

const wall = z.object({
  id: z.string(),
  from: point,
  to: point,
  /** Wall thickness in metres, drawn outside the interior line. */
  thickness: z.number().default(0.15),
})

const opening = z.object({
  type: z.enum(['door', 'window']),
  /** id of the wall this opening sits on */
  wall: z.string(),
  /** Distance in metres from the wall's `from` point to the opening's start. */
  offset: z.number(),
  /** Opening width in metres. */
  width: z.number(),
  /** Doors only: which side the leaf swings towards. */
  swing: z.enum(['left', 'right']).optional(),
})

const furnitureType = z.enum([
  'bed', 'nightstand', 'wardrobe', 'dresser',
  'desk', 'chair', 'bookcase',
  'sofa', 'armchair', 'coffee-table', 'tv-unit', 'tv',
  'table', 'rug', 'plant', 'divider', 'other',
])

/**
 * A piece of furniture as a reusable resource: what it is and how big it is,
 * never where it stands. Rooms place it by its key.
 */
const furnitureResource = z.object({
  type: furnitureType,
  label: z.string().optional(),
  /** Footprint in the piece's own frame, before any rotation. */
  size,
  /**
   * Edge of the footprint that is the piece's front, in its own frame: the
   * side a sofa seats towards, the side a desk user faces, the side a bed's
   * feet point to. A placement's `facing` turns the piece from here.
   */
  facing: direction.optional(),
  /**
   * Clear floor space the piece needs on its working side, checked by the
   * app against walls and other pieces. Only applies when `facing` is set.
   */
  clearance: z.object({
    /** Edge the space is measured from: the `facing` edge or the opposite one. */
    side: z.enum(['front', 'back']).default('front'),
    /** Clear depth required, in metres. */
    distance: z.number(),
    /** Name of the space for messages and labels ("foot", "doors", "chair"). */
    label: z.string().optional(),
    /** Types allowed inside the space, e.g. the chair at a desk. */
    allows: z.array(furnitureType).optional(),
  }).optional(),
  notes: z.string().optional(),
})

/**
 * One furniture resource placed somewhere: in a room, or inside a group's
 * own frame. The map key it sits under is the placement's id.
 */
const placement = z.object({
  /** Key of the furniture resource to place; defaults to the placement's own key. */
  use: z.string().optional(),
  /**
   * Top-left corner of the space the piece occupies once turned and rotated
   * (its axis-aligned bounding box), in metres.
   */
  x: z.number(),
  y: z.number(),
  /** Direction the piece's front points to here; turns it from the resource's `facing`. */
  facing: direction.optional(),
  /** Extra rotation in degrees, clockwise, for pieces set at an angle. */
  rotation: z.number().default(0),
  notes: z.string().optional(),
})

const groupPlacement = z.object({
  /** Key of the group resource to place; defaults to the placement's own key. */
  use: z.string().optional(),
  /** Top-left corner of the space the rotated group box occupies, in metres. */
  x: z.number(),
  y: z.number(),
  /** Rotation in degrees, clockwise, of the whole group around its box centre. */
  rotation: z.number().default(0),
  notes: z.string().optional(),
})

/**
 * A set of pieces that move and rotate as one unit (a bed with its
 * nightstands). Items are placed in the group's own frame, origin at the
 * group's top-left corner; rooms place the group by its key. A group can
 * also be composed from other groups (`groups`), placed in the same frame,
 * so a bed group plus a divider becomes one unit.
 */
const groupResource = z.object({
  label: z.string().optional(),
  /** Group box size in metres. Defaults to the bounding box of the items. */
  size: size.optional(),
  /** Furniture resources placed in the group's frame, keyed by item id. */
  items: z.record(z.string(), placement).default({}),
  /** Other group resources placed in the group's frame, keyed by item id. */
  groups: z.record(z.string(), groupPlacement).default({}),
  notes: z.string().optional(),
})

const zone = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  depth: z.number(),
})

/**
 * One room layout as a resource: its own walls, openings and zones, furnished
 * from the blueprint's furniture and groups. A room is shown only when a
 * template picks it.
 */
const room = z.object({
  title: z.string(),
  description: z.string().optional(),
  /** Interior size of the room in metres. */
  size,
  walls: z.array(wall),
  openings: z.array(opening).default([]),
  zones: z.array(zone).default([]),
  /** Loose pieces, keyed by placement id. */
  furniture: z.record(z.string(), placement).default({}),
  /** Groups, keyed by placement id. */
  groups: z.record(z.string(), groupPlacement).default({}),
})

/**
 * One layout offered by the project: a room resource shown under its own
 * title. Templates are listed in order on the project page.
 */
const template = z.object({
  /** Key of the room resource to show. */
  room: z.string(),
  /** Title and description shown for this layout; default to the room's own. */
  title: z.string().optional(),
  description: z.string().optional(),
})

export default defineContentConfig({
  collections: {
    /**
     * A blueprint document is one project: its resources (furniture, groups
     * and rooms) and the templates, the layouts it offers, each one showing
     * a room resource.
     */
    blueprints: defineCollection({
      type: 'data',
      source: 'blueprints/*.json',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        resources: z.object({
          furniture: z.record(z.string(), furnitureResource),
          groups: z.record(z.string(), groupResource).default({}),
          rooms: z.record(z.string(), room),
        }),
        templates: z.array(template),
      }),
    }),
  },
})
