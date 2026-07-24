import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

const parser = new Parser();

// Flux RSS d'actualités (Tech & Innovation)
const RSS_FEED_URL = 'https://news.google.com/rss/search?q=technologie+IA+innovation&hl=fr&gl=FR&ceid=FR:fr';

// Nettoyage des titres pour créer des noms de fichiers valides
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERREUR : La clé GEMINI_API_KEY est manquante.");
    process.exit(1);
  }

  console.log("📡 Récupération du flux RSS...");
  const feed = await parser.parseURL(RSS_FEED_URL);
  
  const contentDir = path.join(process.cwd(), 'src', 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  const existingFiles = fs.readdirSync(contentDir);

  // Recherche de la première actualité non encore publiée
  let targetItem = null;
  let targetSlug = '';

  for (const item of feed.items) {
    const candidateSlug = slugify(item.title);
    const exists = existingFiles.some(file => file.includes(candidateSlug));
    if (!exists && candidateSlug.length > 10) {
      targetItem = item;
      targetSlug = candidateSlug;
      break;
    }
  }

  if (!targetItem) {
    console.log("ℹ️ Aucune nouvelle actualité inédite trouvée pour le moment.");
    return;
  }

  console.log(`📰 Rédaction de l'article sur : "${targetItem.title}"`);

  // Prompt strict pour garantir la qualité Anti-Bannissement EEAT
  const prompt = `
Tu es un journaliste senior spécialisé en technologie pour le média PulseNews.
À partir de ce sujet d'actualité : "${targetItem.title}" et de son résumé : "${targetItem.contentSnippet || ''}".

Rédige un article complet, analytique et informatif. Respecte STRICTEMENT les règles suivantes :
1. Rédige entre 400 et 600 mots.
2. Utilise un ton neutre, professionnel et journalistique.
3. Ne cite JAMAIS que tu es une IA.
4. Structure l'article avec un chapeau d'introduction, au moins deux titres H2 (##) et une conclusion.
5. Formate la réponse EXCLUSIVEMENT sous la forme du bloc frontmatter YAML ci-dessous suivi du corps en Markdown :

---
title: "Un titre percutant et optimisé SEO en français"
description: "Une méta-description engageante de 150 caractères maximum."
pubDate: "${new Date().toISOString().split('T')[0]}"
author: "Rédaction PulseNews"
category: "Technologie"
---

[Corps de l'article en Markdown ici]
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

  let markdownContent = data.candidates[0].content.parts[0].text;

  // Nettoyage si le modèle renvoie des balises de code Markdown ```markdown
  markdownContent = markdownContent.replace(/^```markdown\n/, '').replace(/```$/, '').trim();

  const fileName = `${Date.now()}-${targetSlug}.md`;
  const filePath = path.join(contentDir, fileName);

  fs.writeFileSync(filePath, markdownContent, 'utf-8');
  console.log(`✅ Article créé avec succès : src/content/${fileName}`);
}

run().catch(err => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});
