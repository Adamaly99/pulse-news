import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://mon-site-pro.vercel.app',
  integrations: [sitemap()],
});
