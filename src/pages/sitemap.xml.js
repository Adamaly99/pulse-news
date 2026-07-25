export async function GET() {
  const siteUrl = 'https://pulse-news-three.vercel.app';
  const posts = await import.meta.glob('../content/*.md', { eager: true });

  const staticPages = [
    '',
    '/a-propos',
    '/category/intelligence-artificielle',
    '/category/android',
    '/category/apple',
    '/category/cybersecurite'
  ];

  const staticUrls = staticPages.map(page => `
    <url>
      <loc>${siteUrl}${page}</loc>
      <changefreq>daily</changefreq>
      <priority>${page === '' ? '1.0' : '0.8'}</priority>
    </url>
  `).join('');

  const articleUrls = Object.values(posts).map((post) => {
    const file = post.file;
    const slug = file.split('/').pop().replace('.md', '');
    const pubDate = post.frontmatter.pubDate 
      ? new Date(post.frontmatter.pubDate).toISOString() 
      : new Date().toISOString();

    return `
    <url>
      <loc>${siteUrl}/news/${slug}</loc>
      <lastmod>${pubDate}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.9</priority>
    </url>
    `;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
  ${staticUrls}
  ${articleUrls}
</urlset>`.trim();

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

