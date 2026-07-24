import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://pulse-news.vercel.app',
  integrations: [sitemap()],
});
