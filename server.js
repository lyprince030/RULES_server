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
   PORT (Render)
========================= */
const PORT = process.env.PORT || 3000;

/* =========================
   Sécurité OpenAI
========================= */
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante");
}

/* =========================
   OpenAI (stable)
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
   SQLite
========================= */
const db = new sqlite3.Database('./db.sqlite', () => {
  console.log('✅ SQLite connecté');
});

/* =========================
   Tables
========================= */
db.run(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  email TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  userId TEXT,
  rulesText TEXT,
  profileText TEXT,
  createdAt TEXT
)`);

/* =========================
   Register
========================= */
app.post('/register', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  const id = shortid.generate();
  db.run(
    `INSERT INTO users VALUES (?,?,?)`,
    [id, username, email],
    () => {
      res.cookie('userId', id, { maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.json({ userId: id });
    }
  );
});

/* =========================
   Session
========================= */
app.get('/me', (req, res) => {
  res.json({ logged: !!req.cookies.userId });
});

/* =========================
   CREATE RULES (ANTI-ERREUR)
========================= */
app.post('/create', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.sendStatus(401);

  const { temps, travail, nonneg, lang } = req.body;
  if (!temps || !travail || !nonneg) {
    return res.status(400).json({ error: "Données incomplètes" });
  }

  const userLang = (lang || 'fr').substring(0, 2);

  const prompt = `
LANGUE: ${userLang}

TEMPS:
${temps}

TRAVAIL:
${travail}

NON-NÉGOCIABLES:
${nonneg}
`;

  let rulesText = "RULES indisponibles.";
  let profileText = "Profil indisponible.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // 🔥 STABLE
      messages: [
        {
          role: "system",
          content:
`Tu DOIS répondre UNIQUEMENT en JSON valide :
{
  "rules": "texte",
  "profile": "texte"
}`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    const raw = completion.choices[0].message.content;

    try {
      const parsed = JSON.parse(raw);
      rulesText = parsed.rules || rulesText;
      profileText = parsed.profile || profileText;
    } catch {
      console.error("❌ JSON invalide IA, fallback activé");
      rulesText = raw; // au pire on affiche le texte brut
    }

  } catch (err) {
    console.error("❌ OpenAI DOWN / BLOQUÉ :", err.message);
  }

  const id = shortid.generate();
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host');

  db.run(
    `INSERT INTO rules VALUES (?,?,?,?,?)`,
    [id, userId, rulesText, profileText, new Date().toISOString()],
    () => {
      res.json({ url: `https://${host}/r/${id}` });
    }
  );
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
   Page publique
========================= */
app.get('/r/:id', (req, res) => {
  db.get(`SELECT * FROM rules WHERE id=?`, [req.params.id], (err, row) => {
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
pre{white-space:pre-wrap}
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
<pre>${row.profileText}</pre>

<a class="btn dl" href="/rules/${row.id}">⬇️ Télécharger</a>
<a class="btn wa" target="_blank"
href="https://wa.me/?text=${encodeURIComponent("Voici mes règles : " + pageUrl)}">WhatsApp</a>

<button class="btn copy" onclick="navigator.clipboard.writeText('${pageUrl}')">
Copier le lien
</button>
</div>
</body>
</html>
`);
  });
});

/* =========================
   Start
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur ${PORT}`);
});
