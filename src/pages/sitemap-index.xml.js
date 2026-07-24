export async function GET(context) {
  const siteUrl = context.site?.toString().replace(/\/$/, '') || 'https://pulse-news-three.vercel.app';
  
  // Récupération dynamique de tous les articles
  const posts = await import.meta.glob('../content/*.md', { eager: true });
  
  const articleUrls = Object.keys(posts).map((filePath) => {
    const slug = filePath.split('/').pop().replace('.md', '');
    const post = posts[filePath];
    const pubDate = post.frontmatter?.pubDate ? new Date(post.frontmatter.pubDate).toISOString() : new Date().toISOString();
    return `
  <url>
    <loc>${siteUrl}/news/${slug}</loc>
    <lastmod>${pubDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${articleUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
