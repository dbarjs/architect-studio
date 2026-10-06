---
name: room-layout
description: Author or edit a blueprint document JSON under content/blueprints/ — one project with its resources (furniture, groups and rooms, in metres, top view) and the templates, the layouts it shows. Use when the user asks to create, change or review a room view / floor plan / furniture arrangement / layout variant.
---

# Blueprint document JSON

Each file `content/blueprints/<slug>.json` is one **blueprint document**, one project: its `resources` (the furniture set, the groups and the **rooms**, each room being one top-down layout with its own walls, openings, zones and placements) and its `templates`, the ordered list of layouts the project shows, each pointing at a room resource. Each document has its own furniture set; when a project has several templates they are alternative layouts of the same pieces (`double-bed-corner.json` shows the same bed group, wardrobe and divider in two arrangements), while a different space with different furniture gets its own document (`basic-room.json`). The sidebar lists the projects with their descriptions; the project page shows the description and one tab per template, rendering the selected layout as an SVG plan. The schema is enforced by `content.config.ts`; a file that violates it is dropped from the collection with a console warning from Nuxt Content.

## Coordinate system

- Units are **metres**, decimals allowed (`0.45`).
- Origin `[0, 0]` is the room's top-left **interior** corner. `x` grows to the right (east), `y` grows downwards (south). North is up.
- `size.width` is the interior extent along x, `size.depth` along y. Walls sit **outside** this rectangle.
- A placement's `x`/`y` is the top-left corner of the **space the piece occupies in the room** after it has been turned (its axis-aligned bounding box). For pieces facing a cardinal direction that is simply the rectangle you see on the plan.

## File shape

```json
{
  "title": "Double bed room",
  "description": "One or two sentences on the space, its furniture and what the layouts explore; shown in the sidebar and at the top of the project page.",
  "resources": {
    "furniture": {
      "bed":        { "type": "bed", "label": "Double bed 160 × 200", "size": { "width": 1.6, "depth": 2.0 }, "facing": "south",
                      "clearance": { "side": "front", "distance": 0.5, "label": "foot" } },
      "nightstand": { "type": "nightstand", "label": "Nightstand", "size": { "width": 0.45, "depth": 0.45 } },
      "desk":       { "type": "desk", "label": "Desk 140 × 70", "size": { "width": 1.4, "depth": 0.7 }, "facing": "north",
                      "clearance": { "side": "back", "distance": 0.9, "label": "chair", "allows": ["chair"] } },
      "chair":      { "type": "chair", "label": "Chair", "size": { "width": 0.6, "depth": 0.6 }, "facing": "north" }
    },
    "groups": {
      "bed-group": {
        "label": "Bed with nightstands", "size": { "width": 2.7, "depth": 2.0 },
        "items": {
          "nightstand-left":  { "use": "nightstand", "x": 0,    "y": 0 },
          "bed":              { "x": 0.55, "y": 0 },
          "nightstand-right": { "use": "nightstand", "x": 2.25, "y": 0 }
        }
      }
    },
    "rooms": {
      "headboard-north": {
        "title": "Headboard on the north wall",
        "description": "One sentence on the intent of this layout.",
        "size": { "width": 6, "depth": 6 },
        "walls": [
          { "id": "north", "from": [0, 0], "to": [6, 0], "thickness": 0.15 },
          { "id": "east",  "from": [6, 0], "to": [6, 6], "thickness": 0.15 },
          { "id": "south", "from": [6, 6], "to": [0, 6], "thickness": 0.15 },
          { "id": "west",  "from": [0, 6], "to": [0, 0], "thickness": 0.15 }
        ],
        "openings": [
          { "type": "window", "wall": "north", "offset": 0.6, "width": 1.8 },
          { "type": "door",   "wall": "west",  "offset": 0.4, "width": 0.9, "swing": "left" }
        ],
        "zones": [
          { "id": "office", "label": "Home office", "x": 0, "y": 0, "width": 2.3, "depth": 2.6 }
        ],
        "groups": {
          "bed-group": { "x": 3.9, "y": 0.45, "rotation": 90, "notes": "Headboard against the east wall." }
        },
        "furniture": {
          "desk":       { "x": 0.3, "y": 0.3, "facing": "north" },
          "desk-chair": { "use": "chair", "x": 0.7, "y": 1.1, "facing": "north" }
        }
      }
    }
  },
  "templates": [
    { "room": "headboard-north" }
  ]
}
```

### Resources: the furniture set

`resources.furniture` is a map of **furniture resources** keyed by a kebab-case key. A resource says *what* a piece is, never *where* it stands:

- `type` is one of: `bed`, `nightstand`, `wardrobe`, `dresser`, `desk`, `chair`, `bookcase`, `sofa`, `armchair`, `coffee-table`, `tv-unit`, `tv`, `table`, `rug`, `plant`, `divider`, `other`. `divider` is a free-standing screen or partition (folding screen, slatted panel) used to separate zones, e.g. behind a headboard for privacy. Use `other` plus a `label` for anything else rather than inventing a type.
- `size` is the footprint in the piece's **own frame**: `width` along x, `depth` along y, before any turning. Give a bed as 1.6 × 2.0 (headboard at the top), a wardrobe as 2.0 × 0.6 (doors at the bottom). Never swap width and depth to orient a piece; orientation belongs to the placement.
- `facing` names the edge that is the piece's front in that frame: the side a sofa seats towards, the side a desk user faces, the side a bed's feet point to. Resources that have a front always declare it (`south` for bed, wardrobe, sofa, TV unit, TV, bookcase; `north` for desk and chair in the examples); nightstands, rugs and coffee tables have none.
- `clearance` (optional, needs `facing`) declares the clear floor space the piece needs; see the rules below.
- `label` is shown on the plan and in the side panel; `notes` is free text shown when the placement has none of its own.

`resources.groups` is a map of **group resources**: pieces that move and rotate as one unit (a bed with its nightstands, a desk with its chair, a sofa with its coffee table). `items` is a map of placements (same fields as room placements) in the group's own frame, origin at the group's top-left corner; `size` is the group box, defaulting to the items' extent. Group items reference furniture resources with `use`, like room placements do.

A group can also be **composed from other groups**: its `groups` map holds group placements (`use`, `x`, `y`, `rotation`, `notes`) in the same frame as its `items`, so a bed group plus a divider becomes one unit that a room places and rotates once:

```json
"bed-group-with-divider": {
  "label": "Bed with nightstands and divider",
  "size": { "width": 2.5, "depth": 2.25 },
  "items": { "divider": { "x": 0, "y": 0 } },
  "groups": { "bed-group": { "x": 0, "y": 0.25 } }
}
```

Either map may be empty. Nested groups may nest further; a group that contains itself is reported as an issue and skipped. Keep each composed group for a real arrangement that a room wants to move as a whole; a room that needs the divider somewhere else places the plain `bed-group` and a loose `divider` instead (`double-bed-corner.json` does both: `corner` uses the composed group, `headboard-north` the parts).

### Rooms

`resources.rooms` is a map keyed by a kebab-case room key. Each room has `title`, `description`, `size`, `walls`, `openings`, `zones`, and two maps of placements, `furniture` and `groups`. A room is only shown when a template points at it; keep it in the resources anyway while a variant is being worked on.

A **placement** is keyed by its placement id (unique within the room) and has:

- `use`: the resource key to place; omit it when the placement id *is* the resource key (`"desk": { ... }` places the `desk` resource; `"desk-chair": { "use": "chair", ... }` places the `chair` resource a second time under another id). The same resource may be placed any number of times.
- `x`, `y`: top-left of the space the turned piece occupies.
- `facing`: the direction the piece's front points in this room. The app turns the piece from its resource `facing` to this one, so a bed resource of 1.6 × 2.0 facing `south` placed with `"facing": "west"` occupies 2.0 × 1.6 with the headboard on the east.
- `rotation`: extra clockwise degrees for pieces set at an angle (a divider at 45°). Combine with `facing` as needed; pieces without a `facing` are oriented with `rotation` alone (`"rotation": 90` turns a 3.0 × 2.0 rug into 2.0 × 3.0).
- `notes`: free text shown in the side panel, overriding the resource's notes.

A **group placement** has `use` (defaults to its key), `x`, `y` (top-left of the space the rotated group box occupies), `rotation` (pivots the whole group around its box centre) and `notes`. Items keep the orientation given inside the group resource; set rotation on the group placement, never on the bed inside it. Each item appears in the room with id `<group id>/<item key>`; items of a nested group get `<group id>/<nested key>/<item key>`.

### Templates

`templates` is an array, in display order, of `{ "room": "<room key>" }`, optionally with a `title` and `description` that replace the room's own on the project page (`{ "room": "corner", "title": "Bed across the corner" }`) (the room's URL is `/blueprints/<slug>?template=<room key>`). The first template is the one opened by default, so put the recommended layout first. A template whose room key is unknown is reported on the page and skipped.

### Walls

List walls **clockwise** around the interior (north → east → south → west for a rectangle). The renderer draws thickness on the outward side, which it derives from that direction. Non-rectangular rooms are fine: add more segments, keep them clockwise and closed.

### Openings

`offset` is measured along the wall from its `from` point to the start of the opening. For a door, `swing` says which jamb carries the hinge as seen when walking along the wall from `from` to `to`: `left` hinges at `offset`, `right` at `offset + width`. Doors always swing into the room.

### Zones

Optional dashed regions that name the functional areas (sleeping, office, lounge). They are the main tool for reasoning about space organisation. Zones may overlap furniture but should not overlap each other.

### Placing rotated things

For a placement facing a cardinal direction, the occupied space is just the resource size with width and depth swapped when facing east or west; `x`/`y` is its top-left corner. For an angle, the occupied space is the bounding box of the rotated footprint: a `w × d` piece at `θ` takes `w·|cos θ| + d·|sin θ|` by `w·|sin θ| + d·|cos θ|`. Work from the piece's centre: decide where the centre must be (e.g. so the bed's foot corners stay 0.5 m off both walls), then `x = cx − bbox width / 2`, `y = cy − bbox depth / 2`. Check the rotated corners of the actual pieces, not of the bounding box, against the walls and the clearance rules below. Hovering any piece in the app shows its distances to the walls; group members hover as one unit.

Typical footprints (m): single bed 0.9×2.0, double 1.4×2.0, queen 1.6×2.0, king 1.8×2.0; nightstand 0.45×0.45; wardrobe 0.6 deep, 1.0–2.5 wide; desk 1.2–1.6 × 0.6–0.8; office chair 0.6×0.6; 2-seat sofa 1.6×0.9, 3-seat 2.2×0.9; coffee table 0.9×0.5; TV unit 1.2–1.8 × 0.4–0.45; a 55" TV is about 1.25 wide; room divider 0.03–0.05 deep, 1.5–2.7 wide (match the headboard plus nightstands when it screens a bed, keep 0.15–0.3 m behind it).

## Layout rules to check before saving

- Every `use` must name an existing resource key; the page shows a yellow warning listing placements it could not resolve, and those pieces are left out of the plan.
- Nothing extends past the interior rectangle; furniture does not overlap other furniture, except rugs, which lie under things. The app enforces this: pieces that overlap each other or reach past a wall are outlined in red, the overlapping region is hatched, and the page shows a red alert listing each conflict (`Wardrobe overlaps Double bed by 0.10 m`, `Desk reaches 0.20 m past the south wall`), together with the clear-space conflicts described below. Group items are checked like loose pieces; rugs under anything and a `tv` on a `tv-unit` (or dresser, table, desk, bookcase) are allowed. A finished layout must show the green "No conflicts" state unless the user asked for a conflict on purpose; touching edges (zero gap) are fine.
- Keep **0.6 m** minimum clear passage, 0.75–0.9 m along the main route from the door.
- Leave **≥ 0.6 m** beside a bed on every side that is not against a wall.
- **Clear space rules (declared on the resource, enforced by the app).** A resource with a `facing` can carry a `clearance` object: `{ "side": "front" | "back", "distance": <metres>, "label": "<name>", "allows": [<types>] }`. `side` is the edge the space is measured from (`front` = the `facing` edge, `back` = the opposite one, default `front`), `label` names the space in messages, `allows` lists types that may stand inside it. The space turns with the piece wherever it is placed. The app reports a conflict when another piece or a wall takes part of that space; rugs never count. Always declare these: **bed** `{ "side": "front", "distance": 0.5, "label": "foot" }` (0.5 m at the foot), **wardrobe** `{ "side": "front", "distance": 0.9, "label": "doors" }`, **dresser** `{ "side": "front", "distance": 0.9, "label": "drawers" }`, **desk** `{ "side": "back", "distance": 0.9, "label": "chair", "allows": ["chair"] }` (0.9 m on the chair side, the chair itself allowed). Adjust `distance` for the furniture at hand and say why in `notes`; leave `clearance` out to skip the check. Messages read `Double bed needs 0.50 m clear at its foot, but the east wall cuts 0.20 m off that space` or `… but Wardrobe sits 0.40 m inside that space`; the zone is drawn dashed red with the taken part hatched, and hovering a piece shows its zone in blue.
- Put the desk near a window, light from the side rather than behind the screen.
- Sofa to TV distance roughly 1.5–2.5 × the screen width; nothing blocks the door swing arc.
- Keys and ids are kebab-case and unique within their map; give zones a clear `label`.

## Workflow

1. Read the existing file if editing; otherwise copy the shape above.
2. Build the furniture set first: one resource per distinct piece, sizes in their own frame, `facing` and `clearance` on everything that has a front. Pieces that belong together (bed + nightstands) become a group resource; a group that always travels with another one (bed group + divider) becomes a group composed from them.
3. For each room, place large pieces first (bed group, wardrobe, sofa), then supporting pieces, then zones around them. To add a layout variant of an existing space, add another room to `resources.rooms` of that document, reuse its resource keys so the layouts can be compared with identical furniture, and list it in `templates`. A new space with its own furniture is a new document.
4. Run through the rules above, adjusting coordinates.
5. Save as `content/blueprints/<slug>.json` with a kebab-case slug; the dev server picks it up without restart.
6. Tell the user which decisions you made (e.g. "headboard on the east wall so the window stays clear") and which templates were added.
