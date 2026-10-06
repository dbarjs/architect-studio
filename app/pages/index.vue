<script setup lang="ts">
const { data: blueprints } = await useBlueprints()
const first = blueprints.value?.[0]
if (first) {
  await navigateTo(`/blueprints/${first.slug}`, { replace: true })
}
</script>

<template>
  <div class="p-8 text-(--ui-text-muted)">
    <h1 class="text-xl font-semibold text-(--ui-text)">No blueprints yet</h1>
    <p class="mt-2">Add a JSON file under <code>content/blueprints/</code> with a furniture set, a room and a template that shows it.</p>
  </div>
</template>
