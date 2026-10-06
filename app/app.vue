<script setup lang="ts">
const { data: blueprints } = await useBlueprints()
const route = useRoute()

useHead({ titleTemplate: t => (t ? `${t} · Architect Studio` : 'Architect Studio') })
</script>

<template>
  <UApp>
    <div class="flex h-screen bg-(--ui-bg)">
      <aside class="w-72 shrink-0 border-r border-(--ui-border) flex flex-col">
        <div class="px-4 py-4 border-b border-(--ui-border)">
          <NuxtLink to="/" class="font-semibold text-lg">Architect Studio</NuxtLink>
          <p class="text-xs text-(--ui-text-muted)">Projects · top view · metres</p>
        </div>
        <nav class="flex-1 overflow-y-auto p-2">
          <ul class="space-y-1">
            <li v-for="bp in blueprints" :key="bp.id">
              <NuxtLink
                :to="`/blueprints/${bp.slug}`"
                class="block rounded-md px-2 py-2 hover:bg-(--ui-bg-elevated)"
                :class="route.path.startsWith(`/blueprints/${bp.slug}`) ? 'bg-(--ui-bg-elevated)' : ''"
              >
                <span class="block text-sm font-medium truncate">{{ bp.title }}</span>
                <span v-if="bp.description" class="block mt-0.5 text-xs text-(--ui-text-muted) line-clamp-3">{{ bp.description }}</span>
                <span class="block mt-1 text-xs text-(--ui-text-muted)">{{ bp.templates }} {{ bp.templates === 1 ? 'layout' : 'layouts' }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-if="!blueprints?.length" class="px-2 text-sm text-(--ui-text-muted)">
            No blueprints yet. Add a JSON file under <code>content/blueprints/</code>.
          </p>
        </nav>
      </aside>
      <main class="flex-1 min-w-0 overflow-auto">
        <NuxtPage />
      </main>
    </div>
  </UApp>
</template>
