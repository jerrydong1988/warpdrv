import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  vite: {
    build: { cssTarget: "chrome110" },
  },
  integrations: [
    starlight({
      title: 'warpdrv',
      sidebar: [],
    }),
  ],
});
