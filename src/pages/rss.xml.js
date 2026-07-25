export async function GET() {
  const siteUrl = 'https://pulse-news-three.vercel.app';
  const posts = await import.meta.glob('../content/*.md', { eager: true });

  const sortedPosts = Object.values(posts).sort((a, b) => 
    new Date(b.frontmatter.pubDate).getTime() - new Date(a.frontmatter.pubDate).getTime()
  );

  const items = sortedPosts.map((post) => {
    const file = post.file;
    const slug = file.split('/').pop().replace('.md', '');
    const { title, description, pubDate, category, author } = post.frontmatter;

    return `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${siteUrl}/news/${slug}</link>
      <guid isPermaLink="true">${siteUrl}/news/${slug}</guid>
      <description><![CDATA[${description}]]></description>
      <pubDate>${new Date(pubDate).toUTCString()}</pubDate>
      <category>${category || 'Technologie'}</category>
      <author>${author || 'Rédaction PulseNews'}</author>
    </item>
    `;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PulseNews - Actualités Tech &amp; IA</title>
    <link>${siteUrl}</link>
    <description>Le média de référence sur l'intelligence artificielle, la cybersécurité et l'écosystème numérique.</description>
    <language>fr-FR</language>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`.trim();

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

