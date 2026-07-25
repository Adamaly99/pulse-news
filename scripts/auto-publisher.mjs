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

// Images Unsplash de haute qualité par thématique avec paramètres de compression
const THUMBNAILS = {
  'intelligence-artificielle': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80',
  'android': 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=1200&auto=format&fit=crop&q=80',
  'apple': 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=1200&auto=format&fit=crop&q=80',
  'cybersecurite': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
  'default': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80'
};

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

  const prompt = `
Tu es le rédacteur en chef senior du média technologique "PulseNews".
Rédige une analyse journalistique approfondie (600 à 800 mots) basée sur l'actualité :
Titre : "${selectedItem.title}"
Lien d'origine : "${selectedItem.link}"
Source d'origine : "${selectedItem.creator || selectedItem.source || 'Presse Spécialisée'}"

CONSIGNES STRICTES DE FORMATAGE (EEAT / GEO / SEO) :
1. Formatage direct en Markdown avec le bloc Frontmatter YAML exact ci-dessous.
2. La catégorie doit être EXACTEMENT l'une des suivantes : [${CATEGORIES.join(', ')}].
3. Inclus OBLIGATOIREMENT un tableau comparatif Markdown dans l'analyse.

FORMAT EN-TÊTE YAML :
---
title: "Titre journalistique percutant en français (max 70 chars)"
description: "Méta-description analytique pour SEO (140-160 chars)"
pubDate: "${new Date().toISOString()}"
category: "choisir_une_categorie_de_la_liste"
author: "Alexandre Dupont"
sourceName: "${selectedItem.creator || selectedItem.source || 'Presse Spécialisée'}"
sourceUrl: "${selectedItem.link}"
image: "REMPLACER_PAR_CATEGORY_IMAGE"
keyTakeaways:
  - "Point clé 1"
  - "Point clé 2"
  - "Point clé 3"
  - "Point clé 4"
  - "Point clé 5"
faq:
  - question: "Question fréquente 1 ?"
    answer: "Réponse claire et précise."
  - question: "Question fréquente 2 ?"
    answer: "Réponse claire et précise."
---

## Contexte Historique & Enjeux
(Présentation détaillée des événements récents, des acteurs concernés et du contexte de l'industrie)

## À retenir
(Synthèse en quelques phrases des faits confirmés)

## Notre Analyse Éditoriale
(Analyse neutre et approfondie : opportunités, limites techniques et incertitudes)

## Tableau Comparatif & Impact
(Fournir un tableau Markdown comparant la situation avant/après ou avec les solutions concurrentes)

| Critère | Situation Antérieure / Concurrence | Nouvelle Annonce / Évolution |
| :--- | :--- | :--- |
| **Impact utilisateur** | ... | ... |
| **Performance / Sécurité** | ... | ... |
| **Adoption Industrie** | ... | ... |

## Conséquences Concrètes pour les Utilisateurs
(Explication claire et pragmatique de ce qui change au quotidien)

## Définitions & Termes Techniques
(Explication pédagogique de 2 à 3 termes complexes cités)

## Sources et Références
Article rédigé sur la base des annonces transmises par **${selectedItem.creator || selectedItem.source || 'Presse Spécialisée'}**.
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
    console.error("❌ ERREUR API Gemini :", JSON.stringify(data));
    process.exit(1);
  }

  let articleContent = data.candidates[0].content.parts[0].text;
  articleContent = articleContent.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '').trim();

  // Détection de la catégorie pour associer l'image d'illustration
  const catMatch = articleContent.match(/category:\s*"([^"]+)"/);
  const detectedCategory = catMatch ? catMatch[1] : 'default';
  const imageUrl = THUMBNAILS[detectedCategory] || THUMBNAILS['default'];

  articleContent = articleContent.replace('REMPLACER_PAR_CATEGORY_IMAGE', imageUrl);

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
    const siteUrl = '[https://pulse-news-three.vercel.app](https://pulse-news-three.vercel.app)';
    const articleUrl = `${siteUrl}/news/${filename.replace('.md', '')}`;
    const indexNowKey = 'pulsenews2026indexnowkey';

    const indexNowPayload = {
      host: 'pulse-news-three.vercel.app',
      key: indexNowKey,
      keyLocation: `${siteUrl}/${indexNowKey}.txt`,
      urlList: [articleUrl]
    };

    const pingRes = await fetch('[https://api.indexnow.org/indexnow](https://api.indexnow.org/indexnow)', {
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
