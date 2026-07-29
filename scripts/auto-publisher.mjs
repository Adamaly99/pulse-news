import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';

const parser = new Parser();
const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');

const CATEGORIES = [
  'intelligence-artificielle',
  'cybersecurite',
  'android',
  'apple',
  'cloud',
  'startups',
  'robotique',
];

// Une image réellement liée au sujet de chaque catégorie (au lieu d'une bannière générique unique)
const THUMBNAILS = {
  'intelligence-artificielle': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80',
  'cybersecurite': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
  'android': 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=1200&auto=format&fit=crop&q=80',
  'apple': 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=1200&auto=format&fit=crop&q=80',
  'cloud': 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&auto=format&fit=crop&q=80',
  'startups': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80',
  'robotique': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&auto=format&fit=crop&q=80',
};

// Plusieurs requêtes par catégorie, réparties par grand acteur/sujet, pour éviter qu'un seul
// fil (ex: "intelligence artificielle" générique) ne fasse remonter toujours la même actu
// dominante du moment (ex: OTAN) et donne l'impression que le média ne traite qu'un seul sujet.
const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=OpenAI&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=Google+IA+Gemini&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=Anthropic+Claude+IA&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=Microsoft+intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=NVIDIA&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=cybersecurite&hl=fr&gl=FR&ceid=FR:fr', category: 'cybersecurite' },
  { url: 'https://news.google.com/rss/search?q=cyberattaque+piratage&hl=fr&gl=FR&ceid=FR:fr', category: 'cybersecurite' },
  { url: 'https://news.google.com/rss/search?q=android+smartphone&hl=fr&gl=FR&ceid=FR:fr', category: 'android' },
  { url: 'https://news.google.com/rss/search?q=Samsung+Xiaomi+smartphone&hl=fr&gl=FR&ceid=FR:fr', category: 'android' },
  { url: 'https://news.google.com/rss/search?q=apple+iphone&hl=fr&gl=FR&ceid=FR:fr', category: 'apple' },
  { url: 'https://news.google.com/rss/search?q=Apple+Mac+ios&hl=fr&gl=FR&ceid=FR:fr', category: 'apple' },
  { url: 'https://news.google.com/rss/search?q=cloud+informatique&hl=fr&gl=FR&ceid=FR:fr', category: 'cloud' },
  { url: 'https://news.google.com/rss/search?q=Microsoft+Azure+cloud&hl=fr&gl=FR&ceid=FR:fr', category: 'cloud' },
  { url: 'https://news.google.com/rss/search?q=startup+technologie+afrique&hl=fr&gl=FR&ceid=FR:fr', category: 'startups' },
  { url: 'https://news.google.com/rss/search?q=startup+francophone+levee+de+fonds&hl=fr&gl=FR&ceid=FR:fr', category: 'startups' },
  { url: 'https://news.google.com/rss/search?q=robotique+robot+humanoide&hl=fr&gl=FR&ceid=FR:fr', category: 'robotique' },
];

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);
}

// Normalise un titre pour la comparaison de doublons : Google News réémet parfois un lien de
// redirection légèrement différent (token encodé différent) pour EXACTEMENT la même actu quand
// le flux est re-servi à un autre moment. Comparer l'URL brute ne suffit donc pas : on compare
// aussi le titre original (avant réécriture par l'IA) une fois normalisé.
function normalizeTitle(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Les liens de redirection Google News pour une même actu partagent un long préfixe commun,
// même quand le token diverge plus loin dans la chaîne (observé empiriquement). Comparer un
// préfixe suffisamment long attrape ces quasi-doublons qu'une comparaison exacte laisse passer.
function urlFingerprint(url) {
  return (url || '').slice(0, 80);
}

// Toutes les sourceUrl déjà publiées (URL exacte + empreinte de préfixe + titre normalisé),
// pour ne jamais republier la même actu deux fois, même si Google News change légèrement le
// lien. Compte aussi les catégories déjà publiées, pour équilibrer la diversité éditoriale.
function getPublishedState() {
  const publishedUrls = new Set();
  const publishedUrlFingerprints = new Set();
  const publishedTitles = new Set();
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));

  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    return { publishedUrls, publishedUrlFingerprints, publishedTitles, categoryCounts };
  }
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const urlMatch = content.match(/^sourceUrl:\s*"((?:[^"\\]|\\.)*)"/m);
    if (urlMatch && urlMatch[1]) {
      publishedUrls.add(urlMatch[1]);
      publishedUrlFingerprints.add(urlFingerprint(urlMatch[1]));
    }
    const sourceTitleMatch = content.match(/^sourceTitle:\s*"((?:[^"\\]|\\.)*)"/m);
    if (sourceTitleMatch && sourceTitleMatch[1]) {
      publishedTitles.add(normalizeTitle(sourceTitleMatch[1]));
    }
    const catMatch = content.match(/^category:\s*"((?:[^"\\]|\\.)*)"/m);
    if (catMatch && catMatch[1] && categoryCounts[catMatch[1]] !== undefined) {
      categoryCounts[catMatch[1]] += 1;
    }
  }
  return { publishedUrls, publishedUrlFingerprints, publishedTitles, categoryCounts };
}

// Choisit un article jamais publié. Les flux sont essayés en priorité pour les catégories
// les MOINS publiées jusqu'ici (plutôt qu'un ordre purement aléatoire), pour que la diversité
// éditoriale s'équilibre activement au lieu de dépendre du hasard. Un item est écarté s'il
// correspond à une URL déjà vue, à une empreinte d'URL déjà vue, OU à un titre déjà vu une
// fois normalisé (couvre le cas où Google ré-émet un lien différent pour la même actu).
async function pickUnpublishedItem(publishedUrls, publishedUrlFingerprints, publishedTitles, categoryCounts) {
  const orderedFeeds = [...RSS_FEEDS].sort(
    (a, b) => (categoryCounts[a.category] ?? 0) - (categoryCounts[b.category] ?? 0)
  );

  for (const feedConfig of orderedFeeds) {
    try {
      const feed = await parser.parseURL(feedConfig.url);
      for (const item of feed.items) {
        if (!item.link) continue;
        const normalized = normalizeTitle(item.title);
        const isDuplicate =
          publishedUrls.has(item.link) ||
          publishedUrlFingerprints.has(urlFingerprint(item.link)) ||
          publishedTitles.has(normalized);
        if (!isDuplicate) {
          return { item, suggestedCategory: feedConfig.category };
        }
      }
    } catch (e) {
      console.warn(`⚠️ Flux RSS illisible (${feedConfig.category}) : ${e.message}`);
    }
  }
  return null;
}

async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Réponse Gemini invalide : ${JSON.stringify(data).slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Erreur : GEMINI_API_KEY non configurée.');
    process.exit(1);
  }

  const { publishedUrls, publishedUrlFingerprints, publishedTitles, categoryCounts } = getPublishedState();
  console.log(`ℹ️ ${publishedUrls.size} URLs de sources déjà publiées, elles seront ignorées.`);
  console.log(`ℹ️ Répartition actuelle des catégories :`, categoryCounts);

  const picked = await pickUnpublishedItem(publishedUrls, publishedUrlFingerprints, publishedTitles, categoryCounts);
  if (!picked) {
    console.log('✅ Aucun nouvel article inédit trouvé dans les flux RSS. Arrêt propre, rien à publier.');
    return;
  }

  const { item: selectedItem, suggestedCategory } = picked;
  console.log(`📰 Nouvel article retenu (catégorie suggérée : ${suggestedCategory}) : "${selectedItem.title}"`);

  const sourceTitle = selectedItem.title || 'Titre non disponible';
  const sourceContent = selectedItem.contentSnippet || selectedItem.content || sourceTitle;
  const sourceName = selectedItem.creator || 'Google News';

  const prompt = `Tu es le rédacteur en chef technique de PulseNews, un média francophone spécialisé Tech : IA, cybersécurité, mobile, cloud, robotique et startups, avec un lectorat francophone et africain.

Rédige une analyse journalistique approfondie (600 à 800 mots) à partir de la source ci-dessous. N'écris JAMAIS une simple paraphrase : apporte du contexte, une mise en perspective marché, et des conséquences concrètes pour les lecteurs.

Titre source : ${sourceTitle}
Source : ${sourceName}
Extrait : ${sourceContent}

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, aucun bloc de code), respectant EXACTEMENT ce schéma :

{
  "title": "Titre journalistique en français, factuel et percutant (max 70 caractères)",
  "description": "Méta-description SEO, 140-160 caractères",
  "category": "une valeur EXACTE parmi : ${CATEGORIES.join(', ')}",
  "keyTakeaways": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5"],
  "faq": [
    { "question": "Question fréquente 1 ?", "answer": "Réponse claire en 2-3 phrases." },
    { "question": "Question fréquente 2 ?", "answer": "Réponse claire en 2-3 phrases." }
  ],
  "body": "Corps de l'article en Markdown avec sections ## Contexte & Enjeux, ## Analyse technique & Impact, ## Ce que cela change pour la suite. Ne cite pas et ne reproduis pas l'URL source dans le corps."
}`;

  let parsed;
  try {
    parsed = await callGemini(apiKey, prompt);
  } catch (e) {
    console.error('❌ Erreur Gemini, publication annulée (aucun fichier écrit) :', e.message);
    process.exit(1);
  }

  if (!parsed.title || !parsed.body) {
    console.error('❌ Champs essentiels manquants dans la réponse JSON, publication annulée.');
    process.exit(1);
  }

  const finalCategory = CATEGORIES.includes(parsed.category) ? parsed.category : suggestedCategory;
  const keyTakeaways = Array.isArray(parsed.keyTakeaways) && parsed.keyTakeaways.length
    ? parsed.keyTakeaways
    : ['Analyse en cours de complément.'];
  const faq = Array.isArray(parsed.faq) && parsed.faq.length
    ? parsed.faq
    : [];

  const pubDate = new Date().toISOString();
  const slug = slugify(parsed.title);
  const filename = `${Date.now()}-${slug}.md`;
  const filePath = path.join(CONTENT_DIR, filename);

  // JSON.stringify() produit une syntaxe d'échappement valide pour un scalaire YAML entre
  // guillemets doubles (guillemets, antislashs et retours à la ligne correctement échappés) :
  // c'est ce qui empêche tout risque de YAML cassé, quel que soit le contenu généré par l'IA.
  const frontmatterLines = [
    '---',
    `title: ${JSON.stringify(parsed.title)}`,
    `description: ${JSON.stringify(parsed.description || '')}`,
    `pubDate: ${JSON.stringify(pubDate)}`,
    `category: ${JSON.stringify(finalCategory)}`,
    `sourceName: ${JSON.stringify(sourceName)}`,
    `sourceUrl: ${JSON.stringify(selectedItem.link || '')}`,
    `sourceTitle: ${JSON.stringify(sourceTitle)}`,
    `image: ${JSON.stringify(THUMBNAILS[finalCategory] || THUMBNAILS['intelligence-artificielle'])}`,
    'keyTakeaways:',
    ...keyTakeaways.map((k) => `  - ${JSON.stringify(k)}`),
  ];

  if (faq.length > 0) {
    frontmatterLines.push('faq:');
    for (const f of faq) {
      frontmatterLines.push(`  - question: ${JSON.stringify(f.question || '')}`);
      frontmatterLines.push(`    answer: ${JSON.stringify(f.answer || '')}`);
    }
  }
  frontmatterLines.push('---', '', parsed.body, '');

  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, frontmatterLines.join('\n'), 'utf-8');
  console.log(`✅ Article publié avec succès : ${filename}`);
}

run().catch((err) => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});
