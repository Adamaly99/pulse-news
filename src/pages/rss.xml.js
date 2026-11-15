import rss from '@astrojs/rss';

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
        // @astrojs/rss échappe déjà les caractères spéciaux XML en interne (via fast-xml-parser).
        // Échapper ici en plus provoquerait un double-échappement (ex: "R&D" -> "R&amp;amp;D").
        title: frontmatter.title || 'Article PulseNews',
        pubDate: new Date(frontmatter.pubDate || Date.now()),
        description: frontmatter.description || '',
        link: `/news/${slug}/`,
      };
    }),
  });
}
