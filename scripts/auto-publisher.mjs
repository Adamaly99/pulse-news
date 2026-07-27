import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

const parser = new Parser();

const RSS_FEEDS = [
  'https://news.google.com/rss/search?q=technologie+IA+innovation&hl=fr&gl=FR&ceid=FR:fr',
  'https://news.google.com/rss/search?q=android+apple+cybersecurite&hl=fr&gl=FR&ceid=FR:fr'
];

const CATEGORIES = [
  'intelligence-artificielle', 'android', 'apple', 'google',
  'microsoft', 'cybersecurite', 'robotique', 'cloud',
  'open-source', 'startups', 'smartphones'
];

const THUMBNAILS = {
  'intelligence-artificielle': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80',
  'android': 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=1200&auto=format&fit=crop&q=80',
  'apple': 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=1200&auto=format&fit=crop&q=80',
  'cybersecurite': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
  'default': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80'
};

// Échappe une chaîne pour qu'elle soit toujours valide dans un scalaire YAML entre guillemets doubles.
// C'est CETTE fonction qui empêche le bug d'origine de se reproduire.
function yamlSafe(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERREUR : La clé GEMINI_API_KEY est manquante.");
    process.exit(1);
  }

  console.log("🔍 Recherche des dernières actualités...");

  let selectedItem = null;
  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      if (feed.items && feed.items.length > 0) {
        selectedItem = feed.items[0];
        break;
      }
    } catch (e) {
      console.error(`Erreur lecture flux ${feedUrl}:`, e.message);
    }
  }

  if (!selectedItem) {
    console.log("ℹ️ Aucun article trouvé.");
    return;
  }

  console.log(`📰 Sujet sélectionné : ${selectedItem.title}`);

  // IMPORTANT : on ne demande PLUS à Gemini de générer sourceUrl, sourceName ou pubDate.
  // Ces champs sont construits par notre code, jamais par le modèle.
  const prompt = `
Tu es le rédacteur en chef senior du média technologique "PulseNews".
Rédige une analyse journalistique approfondie (600 à 800 mots) basée sur l'actualité suivante.

Titre d'origine : "${selectedItem.title}"

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, aucun bloc \`\`\`), respectant EXACTEMENT ce schéma :

{
  "title": "Titre journalistique percutant en français (max 70 caractères)",
  "description": "Méta-description analytique pour SEO (140-160 caractères)",
  "category": "une valeur EXACTE parmi : ${CATEGORIES.join(', ')}",
  "keyTakeaways": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5"],
  "faq": [
    { "question": "Question fréquente 1 ?", "answer": "Réponse claire et précise." },
    { "question": "Question fréquente 2 ?", "answer": "Réponse claire et précise." }
  ],
  "body": "Le corps de l'article en Markdown, structuré avec les sections suivantes : ## Contexte Historique & Enjeux, ## À retenir, ## Notre Analyse Éditoriale, ## Tableau Comparatif & Impact (avec un vrai tableau Markdown avant/après), ## Conséquences Concrètes pour les Utilisateurs, ## Définitions & Termes Techniques, ## Sources et Références (mentionner sobrement que l'article se base sur des annonces publiques du secteur, SANS citer ni reproduire l'URL source)."
}

Assure-toi que l'angle est unique et que le JSON est syntaxiquement valide (guillemets internes échappés avec \\").
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192
      }
    })
  });

  const data = await response.json();

  if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
    console.error("❌ ERREUR API Gemini :", JSON.stringify(data));
    process.exit(1);
  }

  const rawText = data.candidates[0].content.parts[0].text;

  let article;
  try {
    article = JSON.parse(rawText);
  } catch (e) {
    console.error("❌ ERREUR : Gemini n'a pas renvoyé un JSON valide, on annule cette exécution sans rien publier.");
    console.error("Réponse brute reçue :", rawText.slice(0, 500));
    process.exit(1);
  }

  // Validation minimale des champs essentiels
  if (!article.title || !article.body) {
    console.error("❌ ERREUR : champs essentiels manquants dans la réponse JSON, annulation.");
    process.exit(1);
  }

  const detectedCategory = CATEGORIES.includes(article.category) ? article.category : 'intelligence-artificielle';
  const imageUrl = THUMBNAILS[detectedCategory] || THUMBNAILS['default'];

  const sourceUrl = yamlSafe(selectedItem.link);
  const sourceName = yamlSafe(selectedItem.creator || selectedItem.source || 'Presse Spécialisée');
  const pubDate = new Date().toISOString();

  const keyTakeaways = Array.isArray(article.keyTakeaways) && article.keyTakeaways.length > 0
    ? article.keyTakeaways
    : ['Point clé non disponible'];

  const faq = Array.isArray(article.faq) && article.faq.length > 0
    ? article.faq
    : [{ question: 'Question non disponible', answer: 'Réponse non disponible.' }];

  const frontmatter = `---
title: "${yamlSafe(article.title)}"
description: "${yamlSafe(article.description)}"
pubDate: "${pubDate}"
category: "${detectedCategory}"
author: "Alexandre Dupont"
sourceName: "${sourceName}"
sourceUrl: "${sourceUrl}"
image: "${imageUrl}"
keyTakeaways:
${keyTakeaways.map(k => `  - "${yamlSafe(k)}"`).join('\n')}
faq:
${faq.map(f => `  - question: "${yamlSafe(f.question)}"\n    answer: "${yamlSafe(f.answer)}"`).join('\n')}
---`;

  const articleContent = `${frontmatter}\n\n${article.body}\n`;

  const slug = selectedItem.title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 50);

  const filename = `${Date.now()}-${slug}.md`;
  const targetDir = path.join(process.cwd(), 'src', 'content');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, articleContent, 'utf-8');
  console.log(`✅ Article créé avec succès : ${filePath}`);

  // Ping IndexNow
  try {
    const siteUrl = 'https://pulse-news-three.vercel.app';
    const articleUrl = `${siteUrl}/news/${filename.replace('.md', '')}`;
    const indexNowKey = 'pulsenews2026indexnowkey';

    const indexNowPayload = {
      host: 'pulse-news-three.vercel.app',
      key: indexNowKey,
      keyLocation: `${siteUrl}/${indexNowKey}.txt`,
      urlList: [articleUrl]
    };

    const pingRes = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(indexNowPayload)
    });

    console.log(`📡 Ping IndexNow exécuté pour ${articleUrl} (Statut: ${pingRes.status})`);
  } catch (err) {
    console.error("⚠️ Erreur lors du ping IndexNow :", err.message);
  }
}

run().catch(err => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

const parser = new Parser();

const RSS_FEEDS = [
  'https://news.google.com/rss/search?q=technologie+IA+innovation&hl=fr&gl=FR&ceid=FR:fr',
  'https://news.google.com/rss/search?q=android+apple+cybersecurite&hl=fr&gl=FR&ceid=FR:fr'
];

const CATEGORIES = [
  'intelligence-artificielle', 'android', 'apple', 'google',
  'microsoft', 'cybersecurite', 'robotique', 'cloud',
  'open-source', 'startups', 'smartphones'
];

const THUMBNAILS = {
  'intelligence-artificielle': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80',
  'android': 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=1200&auto=format&fit=crop&q=80',
  'apple': 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=1200&auto=format&fit=crop&q=80',
  'cybersecurite': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
  'default': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80'
};

// Échappe une chaîne pour qu'elle soit toujours valide dans un scalaire YAML entre guillemets doubles.
// C'est CETTE fonction qui empêche le bug d'origine de se reproduire.
function yamlSafe(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERREUR : La clé GEMINI_API_KEY est manquante.");
    process.exit(1);
  }

  console.log("🔍 Recherche des dernières actualités...");

  let selectedItem = null;
  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      if (feed.items && feed.items.length > 0) {
        selectedItem = feed.items[0];
        break;
      }
    } catch (e) {
      console.error(`Erreur lecture flux ${feedUrl}:`, e.message);
    }
  }

  if (!selectedItem) {
    console.log("ℹ️ Aucun article trouvé.");
    return;
  }

  console.log(`📰 Sujet sélectionné : ${selectedItem.title}`);

  // IMPORTANT : on ne demande PLUS à Gemini de générer sourceUrl, sourceName ou pubDate.
  // Ces champs sont construits par notre code, jamais par le modèle.
  const prompt = `
Tu es le rédacteur en chef senior du média technologique "PulseNews".
Rédige une analyse journalistique approfondie (600 à 800 mots) basée sur l'actualité suivante.

Titre d'origine : "${selectedItem.title}"

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, aucun bloc \`\`\`), respectant EXACTEMENT ce schéma :

{
  "title": "Titre journalistique percutant en français (max 70 caractères)",
  "description": "Méta-description analytique pour SEO (140-160 caractères)",
  "category": "une valeur EXACTE parmi : ${CATEGORIES.join(', ')}",
  "keyTakeaways": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5"],
  "faq": [
    { "question": "Question fréquente 1 ?", "answer": "Réponse claire et précise." },
    { "question": "Question fréquente 2 ?", "answer": "Réponse claire et précise." }
  ],
  "body": "Le corps de l'article en Markdown, structuré avec les sections suivantes : ## Contexte Historique & Enjeux, ## À retenir, ## Notre Analyse Éditoriale, ## Tableau Comparatif & Impact (avec un vrai tableau Markdown avant/après), ## Conséquences Concrètes pour les Utilisateurs, ## Définitions & Termes Techniques, ## Sources et Références (mentionner sobrement que l'article se base sur des annonces publiques du secteur, SANS citer ni reproduire l'URL source)."
}

Assure-toi que l'angle est unique et que le JSON est syntaxiquement valide (guillemets internes échappés avec \\").
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192
      }
    })
  });

  const data = await response.json();

  if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
    console.error("❌ ERREUR API Gemini :", JSON.stringify(data));
    process.exit(1);
  }

  const rawText = data.candidates[0].content.parts[0].text;

  let article;
  try {
    article = JSON.parse(rawText);
  } catch (e) {
    console.error("❌ ERREUR : Gemini n'a pas renvoyé un JSON valide, on annule cette exécution sans rien publier.");
    console.error("Réponse brute reçue :", rawText.slice(0, 500));
    process.exit(1);
  }

  // Validation minimale des champs essentiels
  if (!article.title || !article.body) {
    console.error("❌ ERREUR : champs essentiels manquants dans la réponse JSON, annulation.");
    process.exit(1);
  }

  const detectedCategory = CATEGORIES.includes(article.category) ? article.category : 'intelligence-artificielle';
  const imageUrl = THUMBNAILS[detectedCategory] || THUMBNAILS['default'];

  const sourceUrl = yamlSafe(selectedItem.link);
  const sourceName = yamlSafe(selectedItem.creator || selectedItem.source || 'Presse Spécialisée');
  const pubDate = new Date().toISOString();

  const keyTakeaways = Array.isArray(article.keyTakeaways) && article.keyTakeaways.length > 0
    ? article.keyTakeaways
    : ['Point clé non disponible'];

  const faq = Array.isArray(article.faq) && article.faq.length > 0
    ? article.faq
    : [{ question: 'Question non disponible', answer: 'Réponse non disponible.' }];

  const frontmatter = `---
title: "${yamlSafe(article.title)}"
description: "${yamlSafe(article.description)}"
pubDate: "${pubDate}"
category: "${detectedCategory}"
author: "Alexandre Dupont"
sourceName: "${sourceName}"
sourceUrl: "${sourceUrl}"
image: "${imageUrl}"
keyTakeaways:
${keyTakeaways.map(k => `  - "${yamlSafe(k)}"`).join('\n')}
faq:
${faq.map(f => `  - question: "${yamlSafe(f.question)}"\n    answer: "${yamlSafe(f.answer)}"`).join('\n')}
---`;

  const articleContent = `${frontmatter}\n\n${article.body}\n`;

  const slug = selectedItem.title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 50);

  const filename = `${Date.now()}-${slug}.md`;
  const targetDir = path.join(process.cwd(), 'src', 'content');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, articleContent, 'utf-8');
  console.log(`✅ Article créé avec succès : ${filePath}`);

  // Ping IndexNow
  try {
    const siteUrl = 'https://pulse-news-three.vercel.app';
    const articleUrl = `${siteUrl}/news/${filename.replace('.md', '')}`;
    const indexNowKey = 'pulsenews2026indexnowkey';

    const indexNowPayload = {
      host: 'pulse-news-three.vercel.app',
      key: indexNowKey,
      keyLocation: `${siteUrl}/${indexNowKey}.txt`,
      urlList: [articleUrl]
    };

    const pingRes = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(indexNowPayload)
    });

    console.log(`📡 Ping IndexNow exécuté pour ${articleUrl} (Statut: ${pingRes.status})`);
  } catch (err) {
    console.error("⚠️ Erreur lors du ping IndexNow :", err.message);
  }
}

run().catch(err => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});
