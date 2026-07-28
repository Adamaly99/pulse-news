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

 // Récupération sécurisée de l'article (qu'il s'appelle article, item ou entry)
const currentArticle = typeof article !== 'undefined' ? article : (typeof item !== 'undefined' ? item : entry);

const sourceTitle = currentArticle?.title || "Titre non disponible";
const sourceUrl = currentArticle?.link || currentArticle?.guid || "";
const sourceContent = currentArticle?.contentSnippet || currentArticle?.content || sourceTitle;
const sourceName = currentArticle?.creator || "Flux RSS";
const detectedCategory = "technologie";

// 1. Date courante au format ISO pour le Frontmatter
const currentDate = new Date().toISOString();

// 2. Le Prompt Système (Règles d'écriture)
const SYSTEM_PROMPT = `Tu es le Rédacteur en Chef Technique de PulseNews, un média spécialisé dans l'actualité Tech, l'IA et le développement.

TA MISSION :
Rédiger un article d'analyse complet en Markdown à partir de la source fournie. Tu ne dois JAMAIS te contenter de paraphraser la source. Tu dois apporter de la valeur ajoutée en synthétisant, en remettant dans son contexte historique/marché et en expliquant l'impact concret.

RÈGLES D'ÉCRITURE :
- Pas d'introductions génériques ("Dans un monde en constante évolution...").
- Pas de ton sensationnaliste.
- Ne reprends pas la structure exacte de la source.
- Rends STRICTEMENT le bloc Frontmatter YAML suivi du corps Markdown, sans aucun texte avant ni après (pas de texte d'introduction ou de conclusion).`;

// 3. Le Prompt Utilisateur (Source + Template dynamique)
const USER_PROMPT = `Voici la source à analyser et transformer :

- Titre source : ${sourceTitle}
- Nom de la source : ${sourceName}
- URL source : ${sourceUrl}
- Contenu source : ${sourceContent}

Génère le fichier Markdown complet en respectant EXACTEMENT la structure suivante :

---
title: "[Titre informatif, factuel et accrocheur - max 70 caractères]"
description: "[Synthèse à forte valeur ajoutée en 2 phrases max]"
pubDate: "${currentDate}"
category: "${detectedCategory}"
sourceName: "${sourceName}"
sourceUrl: "${sourceUrl}"
keyTakeaways:
  - "[Point clé 1 : fait ou chiffre central]"
  - "[Point clé 2 : impact direct sur le secteur]"
  - "[Point clé 3 : limite ou perspective à surveiller]"
faq:
  - question: "[Question technique ou pratique liée au sujet]"
    answer: "[Réponse claire et directe en 2-3 phrases]"
  - question: "[Autre question fréquente sur le sujet]"
    answer: "[Réponse claire et directe en 2-3 phrases]"
---

## 💡 En résumé : Ce qu'il faut retenir

[Analyse d'introduction de 2 paragraphes. Présente le fait principal et sa portée.]

## 🔎 Contexte & Enjeux

[Explique pourquoi cette annonce arrive maintenant. Quel est l'historique et les enjeux du marché ?]

## 🛠️ Analyse technique & Impact direct

[Détaille le fonctionnement, les gains de performance ou les changements concrets pour les utilisateurs/développeurs.]

## 🔮 Ce que cela change pour la suite

[Conclusion prospective sur les risques, l'adoption ou les prochaines étapes.]`;

  const result = await model.generateContent(prompt);
  let responseText = result.response.text().trim();
  
  // Nettoyage si le modèle entoure de ```json ... ```
 // Nettoyage des balises Markdown résiduelles éventuelles
let markdownContent = aiResponseText
  .replace(/^```markdown/i, '')
  .replace(/^```/, '')
  .replace(/```$/, '')
  .trim();

// Écriture du fichier Markdown dans le dossier src/content/
const fileName = `${Date.now()}-${slugify(articleTitle)}.md`;
fs.writeFileSync(`./src/content/${fileName}`, markdownContent);

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

