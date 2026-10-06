import type { BlueprintsCollectionItem } from '@nuxt/content'

export function blueprintSlug(doc: Pick<BlueprintsCollectionItem, 'stem'>): string {
  return doc.stem.split('/').pop() ?? doc.stem
}

export interface BlueprintSummary {
  id: string
  slug: string
  title: string
  description?: string
  /** Number of layouts (templates) the project offers. */
  templates: number
}

/** Every blueprint project with its description, for the sidebar. */
export function useBlueprints() {
  return useAsyncData('blueprints', async (): Promise<BlueprintSummary[]> => {
    const docs = await queryCollection('blueprints').select('id', 'stem', 'title', 'description', 'templates').order('title', 'ASC').all()
    return docs.map(d => ({
      id: d.id,
      slug: blueprintSlug(d),
      title: d.title,
      description: d.description,
      templates: d.templates.length,
    }))
  })
}

/** One blueprint document by its file slug (`content/blueprints/<slug>.json`). */
export function useBlueprint(slug: MaybeRefOrGetter<string>) {
  return useAsyncData(() => `blueprint-${toValue(slug)}`, () =>
    queryCollection('blueprints').where('stem', '=', `blueprints/${toValue(slug)}`).first(),
  )
}
