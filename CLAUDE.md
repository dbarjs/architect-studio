# architect-studio

## The project

This project is for an architect view to help me with interior design.
The idea is use claude code with an skill to create JSON files that represent the room walls and its furniture (bed, tv, wardrobe, sofa etc).

The focus is the room layouts, not the style itself to improve space organization. Only top view is considered for the room layouts.

I think that is good to use Nuxt Content to manage the JSON files inside the content directory with all JSON, each json represets one view of some room. The layout show all an sidebar with the available room views and the main area displaying the selected room view.

Call the JSON files as "blueprint document", the document must represent the room layout from a top view, including walls and furniture placement, define each furniture with its type, dimensions, and position within the room, consider angles and orientation as needed.

Use metric system.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Project structure

- `content/blueprints/*.json` — one blueprint document (project) per file: `resources` (`furniture`, `groups` and `rooms`, all keyed maps; a group may be composed from other groups; each room has its own walls, openings and zones and places furniture and groups by key) and `templates` (ordered array of the layouts the project shows, each pointing at a room key with an optional title and description). Schema in `content.config.ts` (Nuxt Content data collection `blueprints`).
- `app/utils/layout.ts` — geometry: `resolveRoom` / `resolveTemplate` turn a blueprint room into placed furniture, plus footprints, clearance zones and the conflict detector.
- `app/components/RoomPlan.vue` — SVG top-view renderer (100 px per metre) of a resolved room.
- `app/pages/blueprints/[slug].vue` — project page: description, one tab per template (`?template=<room key>`) and the selected layout; `app/app.vue` holds the sidebar listing the projects with their descriptions.
- `.claude/skills/room-layout/` — the skill for authoring blueprint JSON files. Use it whenever creating or editing a room layout.
