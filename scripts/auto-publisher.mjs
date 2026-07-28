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
];

// Plusieurs requêtes RSS pour couvrir davantage de catégories, pas seulement IA/cybersécurité
const RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr', category: 'intelligence-artificielle' },
  { url: 'https://news.google.com/rss/search?q=cybersecurite&hl=fr&gl=FR&ceid=FR:fr', category: 'cybersecurite' },
  { url: 'https://news.google.com/rss/search?q=android+smartphone&hl=fr&gl=FR&ceid=FR:fr', category: 'android' },
  { url: 'https://news.google.com/rss/search?q=apple+iphone&hl=fr&gl=FR&ceid=FR:fr', category: 'apple' },
  { url: 'https://news.google.com/rss/search?q=cloud+informatique&hl=fr&gl=FR&ceid=FR:fr', category: 'cloud' },
  { url: 'https://news.google.com/rss/search?q=startup+technologie+afrique&hl=fr&gl=FR&ceid=FR:fr', category: 'startups' },
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

// Toutes les sourceUrl déjà publiées, pour ne jamais republier la même actu deux fois
function getPublishedSourceUrls() {
  const publishedUrls = new Set();
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    return publishedUrls;
  }
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const match = content.match(/^sourceUrl:\s*"((?:[^"\\]|\\.)*)"/m);
    if (match && match[1]) {
      publishedUrls.add(match[1]);
    }
  }
  return publishedUrls;
}

// Choisit un article jamais publié, en piochant dans un flux RSS différent à chaque run
// (ordre mélangé pour éviter de toujours retomber sur la même catégorie)
async function pickUnpublishedItem(publishedUrls) {
  const shuffledFeeds = [...RSS_FEEDS].sort(() => Math.random() - 0.5);

  for (const feedConfig of shuffledFeeds) {
    try {
      const feed = await parser.parseURL(feedConfig.url);
      for (const item of feed.items) {
        if (item.link && !publishedUrls.has(item.link)) {
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

  const publishedUrls = getPublishedSourceUrls();
  console.log(`ℹ️ ${publishedUrls.size} URLs de sources déjà publiées, elles seront ignorées.`);

  const picked = await pickUnpublishedItem(publishedUrls);
  if (!picked) {
    console.log('✅ Aucun nouvel article inédit trouvé dans les flux RSS. Arrêt propre, rien à publier.');
    return;
  }

  const { item: selectedItem, suggestedCategory } = picked;
  console.log(`📰 Nouvel article retenu (catégorie suggérée : ${suggestedCategory}) : "${selectedItem.title}"`);

  const sourceTitle = selectedItem.title || 'Titre non disponible';
  const sourceContent = selectedItem.contentSnippet || selectedItem.content || sourceTitle;
  const sourceName = selectedItem.creator || 'Google News';

  const prompt = `Tu es le rédacteur en chef technique de PulseNews, un média francophone spécialisé Tech, IA et cybersécurité.

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
