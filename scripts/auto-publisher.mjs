import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

const parser = new Parser();
const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'news');

// 1. Récupérer toutes les URLs de sources déjà publiées
function getPublishedSourceUrls() {
  const publishedUrls = new Set();
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    return publishedUrls;
  }

  const files = fs.readdirSync(CONTENT_DIR);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
      const match = content.match(/sourceUrl:\s*["']?([^"'\n]+)["']?/);
      if (match && match[1]) {
        publishedUrls.add(match[1].trim());
      }
    }
  }
  return publishedUrls;
}

// 2. Nettoyer les chaînes pour la génération de slug
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ Erreur : GEMINI_API_KEY non configurée.");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const publishedUrls = getPublishedSourceUrls();
  console.log(`ℹ️ ${publishedUrls.size} URLs de sources déjà répertoriées.`);

  // RSS Feeds
  const feedUrls = [
    'https://news.google.com/rss/search?q=technology&hl=fr&gl=FR&ceid=FR:fr',
    'https://news.google.com/rss/search?q=intelligence+artificielle&hl=fr&gl=FR&ceid=FR:fr'
  ];

  let selectedItem = null;

  for (const url of feedUrls) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items) {
        if (!publishedUrls.has(item.link)) {
          selectedItem = item;
          break;
        }
      }
    } catch (e) {
      console.warn(`⚠️ Impossible de lire le flux : ${url}`);
    }
    if (selectedItem) break;
  }

  if (!selectedItem) {
    console.log("✅ Aucun nouvel article détecté dans les flux RSS. Arrêt propre.");
    return;
  }

  console.log(`📰 Nouvel article trouvé : "${selectedItem.title}"`);

  const prompt = `
Tu es un journaliste tech expert pour PulseNews. Réécris cet article sous forme d'une analyse complète en français.
Source d'origine : "${selectedItem.title}" (${selectedItem.link})
Contenu extrait : "${selectedItem.contentSnippet || selectedItem.content || ''}"

Réponds STRICTEMENT sous forme d'objet JSON respectant ce schéma exact (sans balises markdown supplémentaires) :
{
  "title": "Titre accrocheur et unique",
  "description": "Résumé de 2 phrases maximum",
  "category": "intelligence-artificielle" | "cybersecurite" | "technologie",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
  "faq": [
    {"question": "Question 1 ?", "answer": "Réponse 1"},
    {"question": "Question 2 ?", "answer": "Réponse 2"}
  ],
  "content": "Corps de l'article au format Markdown..."
}
`;

  const result = await model.generateContent(prompt);
  let responseText = result.response.text().trim();
  
  // Nettoyage si le modèle entoure de ```json ... ```
  if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    console.error("❌ Erreur de parsing JSON depuis Gemini :", responseText);
    process.exit(1);
  }

  const slug = slugify(parsed.title);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(CONTENT_DIR, filename);

  const fileContent = `---
title: ${JSON.stringify(parsed.title)}
description: ${JSON.stringify(parsed.description)}
pubDate: ${new Date().toISOString()}
category: ${JSON.stringify(parsed.category || 'technologie')}
sourceUrl: ${JSON.stringify(selectedItem.link)}
sourceName: ${JSON.stringify(selectedItem.source || 'Google News')}
keyTakeaways:
${parsed.keyTakeaways ? parsed.keyTakeaways.map(k => `  - ${JSON.stringify(k)}`).join('\n') : '  - Tout savoir sur les dernières innovations.'}
faq:
${parsed.faq ? parsed.faq.map(f => `  - question: ${JSON.stringify(f.question)}\n    answer: ${JSON.stringify(f.answer)}`).join('\n') : ''}
---

${parsed.content}
`;

  fs.writeFileSync(filePath, fileContent, 'utf-8');
  console.log(`🚀 Article créé avec succès : ${filename}`);
}

run();

