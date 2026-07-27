import rss from '@astrojs/rss';

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
  const posts = await import.meta.glob('../content/**/*.md', { eager: true });
  const postList = Object.values(posts);

  return rss({
    title: 'PulseNews — L\'actualité Tech & IA',
    description: 'Suivez les dernières innovations tech, IA, et cybersécurité.',
    site: context.site || 'https://pulse-news-three.vercel.app',
    items: postList.map((post) => {
      const slug = post.file.split('/').pop().replace('.md', '');
      const frontmatter = post.frontmatter || {};
      return {
        title: xmlEscape(frontmatter.title || 'Article PulseNews'),
        pubDate: new Date(frontmatter.pubDate || Date.now()),
        description: xmlEscape(frontmatter.description || ''),
        link: `/news/${slug}/`,
      };
    }),
  });
}
