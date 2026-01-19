require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const shortid = require('shortid');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

/* =========================
   PORT dynamique pour Render
========================= */
const PORT = process.env.PORT || 3000;

/* =========================
   OpenAI
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   Middlewares
========================= */
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());
app.use(express.static('public'));

/* =========================
   Base SQLite
========================= */
const db = new sqlite3.Database('./db.sqlite', () => {
  console.log('✅ Connecté à SQLite.');
});

/* =========================
   Tables
========================= */
db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  email TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  userId TEXT,
  rulesText TEXT,
  profileText TEXT,
  createdAt TEXT
)`);

/* =========================
   Register / Connexion
========================= */
app.post('/register', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) return res.status(400).json({ error: "Champs manquants" });

  const id = shortid.generate();

  db.run(`INSERT INTO users VALUES(?,?,?)`, [id, username, email], () => {
    res.cookie('userId', id, { maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ userId: id });
  });
});

/* =========================
   Session
========================= */
app.get('/me', (req, res) => {
  if (!req.cookies.userId) return res.json({ logged: false });
  res.json({ logged: true });
});

/* =========================
   Create RULES + Profil IA (multi-langue)
========================= */
app.post('/create', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.sendStatus(401);

  const { temps, travail, nonneg, lang } = req.body;
  if (!temps || !travail || !nonneg)
    return res.status(400).json({ error: "Données incomplètes" });

  const userLang = (lang || 'fr').substring(0, 2); // ex: "fr-FR" → "fr"

  const prompt = `
LANG: ${userLang}

TEMPS:
${temps}

TRAVAIL / COMMUNICATION:
${travail}

NON-NÉGOCIABLES:
${nonneg}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Répond STRICTEMENT en JSON :
{
  "rules": "RULES.txt clair, structuré, ferme, dans la langue spécifiée",
  "profile": "Profil psychologique court de la personne, dans la langue spécifiée"
}
`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    let aiData;
    try {
      aiData = JSON.parse(completion.choices[0].message.content);
    } catch (jsonErr) {
      console.error("❌ JSON IA invalide :", completion.choices[0].message.content);
      return res.status(500).json({ error: "Erreur IA : JSON invalide" });
    }

    const rulesText = aiData.rules;
    const profileText = aiData.profile;

    const id = shortid.generate();

    // URL publique dynamique (Render)
    const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host');

    db.run(
      `INSERT INTO rules(id, userId, rulesText, profileText, createdAt)
       VALUES(?,?,?,?,?)`,
      [id, userId, rulesText, profileText, new Date().toISOString()],
      () => res.json({ url: `https://${host}/r/${id}` })
    );

  } catch (e) {
    console.error("❌ Erreur IA :", e);
    res.status(500).json({ error: "Erreur lors de la génération IA : " + e.message });
  }
});

/* =========================
   Télécharger RULES.txt
========================= */
app.get('/rules/:id', (req, res) => {
  db.get(`SELECT rulesText FROM rules WHERE id=?`, [req.params.id], (err, row) => {
    if (!row) return res.sendStatus(404);
    res.setHeader('Content-Type', 'text/plain');
    res.send(row.rulesText);
  });
});

/* =========================
   Page Publique / Partage
========================= */
app.get('/r/:id', (req, res) => {
  db.get(`SELECT rulesText, profileText FROM rules WHERE id=?`, [req.params.id], (err, row) => {
    if (!row) return res.send("RULES introuvable");

    const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host');
    const pageUrl = `https://${host}/r/${req.params.id}`;

    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>RULES</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:Arial;background:#f5f5f5;padding:20px}
.box{max-width:700px;margin:auto;background:#fff;padding:25px;border-radius:10px}
pre{white-space:pre-wrap;font-size:14px}
.btn{display:block;margin:10px 0;padding:12px;border-radius:6px;text-decoration:none;color:#fff;text-align:center}
.dl{background:#0077cc}
.wa{background:#25D366}
.copy{background:#444;border:none;width:100%}
</style>
</head>
<body>
<div class="box">
<h2>📜 RULES</h2>
<pre>${row.rulesText}</pre>

<h3>🧠 Profil IA</h3>
<pre>${row.profileText || "Profil indisponible"}</pre>

<a class="btn dl" href="/rules/${req.params.id}">⬇️ Télécharger RULES.txt</a>

<a class="btn wa" target="_blank"
href="https://wa.me/?text=${encodeURIComponent("Voici mes règles personnelles : " + pageUrl)}">
📲 Partager WhatsApp
</a>

<button class="btn copy" onclick="navigator.clipboard.writeText('${pageUrl}')">
📋 Copier le lien
</button>
</div>
</body>
</html>
`);
  });
});

/* =========================
   Démarrage serveur
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
