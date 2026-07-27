import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

function xmlEscape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context) {
  const news = await getCollection('news');
  
  return rss({
    title: 'PulseNews — L\'actualité Tech & IA',
    description: 'Suivez les dernières innovations tech, IA, et cybersécurité.',
    site: context.site || 'https://pulse-news-three.vercel.app',
    items: news.map((post) => ({
      title: xmlEscape(post.data.title),
      pubDate: post.data.pubDate,
      description: xmlEscape(post.data.description),
      link: `/news/${post.slug}/`,
    })),
  });
}
