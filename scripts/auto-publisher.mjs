import RssParser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const parser = new RssParser();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const RSS_FEEDS = [
  'https://news.google.com/rss/search?q=technology+AI+software&hl=fr&gl=FR&ceid=FR:fr',
  'https://news.google.com/rss/search?q=android+apple+cybersecurite&hl=fr&gl=FR&ceid=FR:fr'
];

const CATEGORIES = [
  'intelligence-artificielle', 'android', 'apple', 'google', 
  'microsoft', 'cybersecurite', 'robotique', 'cloud', 
  'open-source', 'startups', 'smartphones'
];

async function run() {
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
    console.log("Aucun article trouvé dans les flux RSS.");
    return;
  }

  console.log(`📰 Sujet sélectionné : ${selectedItem.title}`);

  // Utilisation du modèle Gemini 2.5 Flash
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
Tu es le rédacteur en chef senior du média technologique francophone "PulseNews".
Rédige un article complet, analytique, neutre et hautement informatif à partir de cette actualité :
Titre : "${selectedItem.title}"
Lien d'origine : "${selectedItem.link}"
Source d'origine : "${selectedItem.creator || selectedItem.source || 'Presse Tech'}"

CONSIGNES STRICTES DE RÉDACTION ET STRUCTURE :
1. Rédige l'article directement au format Markdown avec le Frontmatter YAML en haut.
2. La catégorie doit être EXACTEMENT l'une des suivantes : [${CATEGORIES.join(', ')}].
3. Rédige un contenu riche d'environ 500 à 700 mots.

FORMAT OBLIGATOIRE DU FICHIER :

---
title: "Titre percutant et informatif (max 70 chars)"
description: "Résumé accrocheur pour les moteurs de recherche et réseaux (140-160 chars)"
pubDate: "${new Date().toISOString()}"
category: "choisir_une_categorie_de_la_liste"
author: "Rédaction PulseNews"
sourceName: "${selectedItem.creator || selectedItem.source || 'Presse Tech'}"
sourceUrl: "${selectedItem.link}"
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

## Introduction & Contexte
(Présentation claire des faits récents, du contexte et des acteurs impliqués)

## À retenir
(Synthèse en quelques phrases)

## Notre Analyse
(Analyse approfondie : Pourquoi cette information est importante ? Ce qui est confirmé vs incertitudes ? Impact sur l'industrie et les utilisateurs ?)

## Avantages, Limites et Risques
(Détail des points forts, des faiblesses ou des risques liés à cette nouveauté)

## Ce que cela change pour les utilisateurs
(Conséquences pratiques et concrètes au quotidien)

## Définitions & Glossaire
(Explication simple des 2-3 termes techniques clés mentionnés dans l'article)

## Sources et Références
Article basé sur les informations publiées par **${selectedItem.creator || selectedItem.source || 'Presse Tech'}**.
`;

  const result = await model.generateContent(prompt);
  let articleContent = result.response.text();

  // Nettoyage des balises de code Markdown globales si retournées par l'API
  articleContent = articleContent.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

  // Génération du nom de fichier unique
  const slug = selectedItem.title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);

  const filename = `${Date.now()}-${slug}.md`;
  const targetDir = path.join(process.cwd(), 'src', 'content');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, articleContent, 'utf-8');
  console.log(`✅ Article créé avec succès : ${filePath}`);

  // Notification IndexNow (Ping instantané)
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

    const response = await fetch('[https://api.indexnow.org/indexnow](https://api.indexnow.org/indexnow)', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(indexNowPayload)
    });

    console.log(`📡 Ping IndexNow exécuté pour ${articleUrl} (Statut: ${response.status})`);
  } catch (err) {
    console.error("⚠️ Erreur lors du ping IndexNow :", err.message);
  }
}

run();
