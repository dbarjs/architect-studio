// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxt/content',
  ],
  css: ['~/assets/css/main.css'],
  content: {
    experimental: {
      // Node >= 22.5 ships node:sqlite, so no native build step is needed.
      sqliteConnector: 'native',
    },
  },
})
