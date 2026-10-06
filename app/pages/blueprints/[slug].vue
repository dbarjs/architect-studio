<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import { conflictingIds, detectConflicts, resolveTemplate } from '~/utils/layout'

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))
const { data: blueprint } = await useBlueprint(slug)

if (!blueprint.value) {
  throw createError({ statusCode: 404, statusMessage: 'Blueprint not found', fatal: true })
}

useHead({ title: () => blueprint.value?.title ?? '' })

/** The project's layouts: each template resolved to the room it shows. */
const templates = computed(() =>
  (blueprint.value?.templates ?? []).map(t => ({ ...t, resolved: blueprint.value ? resolveTemplate(blueprint.value, t) : null })),
)
const missing = computed(() => templates.value.filter(t => !t.resolved).map(t => t.room))

/** Selected template, by its room key in the `template` query parameter; defaults to the first one. */
const tabs = computed<TabsItem[]>(() => templates.value.filter(t => t.resolved).map(t => ({ label: t.resolved!.title, value: t.room })))
const selected = computed({
  get: () => {
    const q = String(route.query.template ?? '')
    return tabs.value.some(t => t.value === q) ? q : String(tabs.value[0]?.value ?? '')
  },
  set: (value: string | number) => router.replace({ query: { ...route.query, template: String(value) } }),
})
const room = computed(() => templates.value.find(t => t.room === selected.value)?.resolved ?? null)

/** Hard conflicts: pieces overlapping each other or reaching through a wall. */
const conflicts = computed(() => (room.value ? detectConflicts(room.value) : []))
const conflictIds = computed(() => conflictingIds(conflicts.value))

/** The project's furniture set, marking what the selected layout uses. */
const furnitureSet = computed(() => {
  if (!blueprint.value || !room.value) return []
  const used = new Set([...room.value.furniture, ...room.value.groups.flatMap(g => g.items)].map(f => f.use))
  return Object.entries(blueprint.value.resources.furniture).map(([key, r]) => ({ key, ...r, used: used.has(key) }))
})
</script>

<template>
  <div v-if="blueprint" class="p-6 lg:p-8 space-y-6">
    <header>
      <h1 class="text-2xl font-semibold">{{ blueprint.title }}</h1>
      <p v-if="blueprint.description" class="mt-1 text-(--ui-text-muted) max-w-prose">{{ blueprint.description }}</p>
    </header>

    <UAlert
      v-if="missing.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-link-2-off"
      :title="`${missing.length} ${missing.length === 1 ? 'template points' : 'templates point'} at a room that is not in the resources`"
      :description="missing.join(', ')"
    />

    <UTabs v-if="tabs.length > 1" v-model="selected" :items="tabs" :content="false" variant="link" />

    <section v-if="room" class="space-y-6">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div class="space-y-6">
          <section class="rounded-lg border border-(--ui-border) bg-white p-4 overflow-auto">
            <RoomPlan :room="room" />
          </section>

          <div>
            <h2 class="text-xl font-semibold">{{ room.title }}</h2>
            <p v-if="room.description" class="mt-1 text-(--ui-text-muted) max-w-prose">{{ room.description }}</p>
            <p class="mt-2 text-sm text-(--ui-text-muted)">
              Interior {{ room.size.width }} × {{ room.size.depth }} m ·
              {{ (room.size.width * room.size.depth).toFixed(1) }} m² ·
              {{ room.furniture.length + room.groups.reduce((n, g) => n + g.items.length, 0) }} furniture items<template v-if="room.groups.length"> · {{ room.groups.length }} {{ room.groups.length === 1 ? 'group' : 'groups' }}</template>
            </p>
          </div>

          <UAlert
            v-if="room.issues.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-link-2-off"
            :title="`${room.issues.length} ${room.issues.length === 1 ? 'placement' : 'placements'} could not be resolved`"
          >
            <template #description>
              <ul class="mt-1 list-disc pl-4 space-y-0.5">
                <li v-for="(issue, i) in room.issues" :key="i">{{ issue }}</li>
              </ul>
            </template>
          </UAlert>

          <UAlert
            v-if="conflicts.length"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="`${conflicts.length} ${conflicts.length === 1 ? 'conflict' : 'conflicts'} in this layout`"
          >
            <template #description>
              <ul class="mt-1 list-disc pl-4 space-y-0.5">
                <li v-for="(c, i) in conflicts" :key="i">{{ c.message }}</li>
              </ul>
            </template>
          </UAlert>
          <UAlert
            v-else
            color="success"
            variant="soft"
            icon="i-lucide-check"
            title="No conflicts: nothing overlaps and everything is inside the walls"
          />
        </div>

        <aside class="space-y-4 text-sm">
          <div v-if="room.zones.length">
            <h3 class="font-medium mb-2">Zones</h3>
            <ul class="space-y-1">
              <li v-for="z in room.zones" :key="z.id" class="flex justify-between gap-2">
                <span>{{ z.label }}</span>
                <span class="text-(--ui-text-muted) tabular-nums">{{ z.width }} × {{ z.depth }} m</span>
              </li>
            </ul>
          </div>
          <div v-for="g in room.groups" :key="g.id">
            <h3 class="font-medium mb-1">
              {{ g.label ?? g.id }}
              <span class="text-xs font-normal text-(--ui-text-muted)">group<template v-if="g.groups.length"> · composed from {{ g.groups.map(id => id.slice(g.id.length + 1)).join(', ') }}</template><template v-if="g.rotation"> · rotated {{ g.rotation }}°</template></span>
            </h3>
            <p v-if="g.notes" class="mb-2 text-xs text-(--ui-text-muted)">{{ g.notes }}</p>
            <ul class="space-y-1 border-l-2 border-(--ui-border) pl-3">
              <li v-for="f in g.items" :key="f.id" class="flex justify-between gap-2">
                <span>
                  <span :class="conflictIds.has(f.id) ? 'text-(--ui-error) font-medium' : ''">{{ f.label ?? f.type }}</span>
                  <span v-if="conflictIds.has(f.id)" class="ml-1 text-xs text-(--ui-error)">conflict</span>
                  <span v-if="f.notes" class="block text-xs text-(--ui-text-muted)">{{ f.notes }}</span>
                </span>
                <span class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">{{ f.width }} × {{ f.depth }} m</span>
              </li>
            </ul>
          </div>
          <div v-if="room.furniture.length">
            <h3 class="font-medium mb-2">Furniture</h3>
            <ul class="space-y-1">
              <li v-for="f in room.furniture" :key="f.id" class="flex justify-between gap-2">
                <span>
                  <span :class="conflictIds.has(f.id) ? 'text-(--ui-error) font-medium' : ''">{{ f.label ?? f.type }}</span>
                  <span v-if="conflictIds.has(f.id)" class="ml-1 text-xs text-(--ui-error)">conflict</span>
                  <span v-if="f.notes" class="block text-xs text-(--ui-text-muted)">{{ f.notes }}</span>
                </span>
                <span class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">{{ f.width }} × {{ f.depth }} m</span>
              </li>
            </ul>
          </div>
          <div v-if="room.openings.length">
            <h3 class="font-medium mb-2">Openings</h3>
            <ul class="space-y-1">
              <li v-for="(o, i) in room.openings" :key="i" class="flex justify-between gap-2">
                <span class="capitalize">{{ o.type }} · {{ o.wall }} wall</span>
                <span class="text-(--ui-text-muted) tabular-nums">{{ o.width }} m</span>
              </li>
            </ul>
          </div>
          <div v-if="furnitureSet.length">
            <h3 class="font-medium mb-1">Furniture set</h3>
            <p class="mb-2 text-xs text-(--ui-text-muted)">Shared by every layout of this project; greyed pieces are not placed in this one.</p>
            <ul class="space-y-1">
              <li v-for="r in furnitureSet" :key="r.key" class="flex justify-between gap-2" :class="r.used ? '' : 'text-(--ui-text-muted) line-through decoration-(--ui-border)'">
                <span>{{ r.label ?? r.type }} <code class="text-xs text-(--ui-text-muted) no-underline">{{ r.key }}</code></span>
                <span class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">{{ r.size.width }} × {{ r.size.depth }} m</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>

    <p v-else class="text-(--ui-text-muted)">
      This project has no layout to show yet. Add a room under <code>resources.rooms</code> and a template that points at it.
    </p>
  </div>
</template>
