require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const shortid = require('shortid');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   Sécurité globale
========================= */
app.use(helmet());
app.disable('x-powered-by');

/* =========================
   GROQ (GRATUIT)
========================= */
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

/* =========================
   OpenAI optionnel
========================= */
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* =========================
   Middlewares
========================= */
app.use(bodyParser.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
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
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT,
      isAdmin INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      userId TEXT,
      rulesText TEXT,
      profileText TEXT,
      createdAt TEXT
    )
  `);
});

/* =========================
   Register
========================= */
app.post('/register', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email)
    return res.status(400).json({ error: "Champs manquants" });

  const id = shortid.generate();

  db.run(
    `INSERT INTO users (id, username, email) VALUES (?,?,?)`,
    [id, username, email],
    () => {
      res.cookie('userId', id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
      });
      res.json({ success: true });
    }
  );
});

/* =========================
   Session
========================= */
app.get('/me', (req, res) => {
  res.json({ logged: Boolean(req.cookies.userId) });
});

/* =========================
   Middleware ADMIN
========================= */
function requireAdmin(req, res, next) {
  const userId = req.cookies.userId;
  if (!userId) return res.sendStatus(401);

  db.get(
    `SELECT isAdmin FROM users WHERE id=?`,
    [userId],
    (err, row) => {
      if (!row || row.isAdmin !== 1) return res.sendStatus(403);
      next();
    }
  );
}

/* =========================
   CREATE RULES (fallback garanti)
========================= */
app.post('/create', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId)
    return res.status(401).json({ error: "Non connecté" });

  const { temps, travail, nonneg, lang } = req.body;
  if (!temps || !travail || !nonneg)
    return res.status(400).json({ error: "Données incomplètes" });

  const userLang = (lang || 'fr').substring(0, 2);
  const id = shortid.generate();
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host');

  let rulesText = `
RÈGLES PERSONNELLES

TEMPS
${temps}

TRAVAIL / COMMUNICATION
${travail}

NON-NÉGOCIABLES
${nonneg}
`.trim();

  let profileText = "Profil IA indisponible.";

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Réponds STRICTEMENT en JSON :
{ "rules": "texte", "profile": "texte" }`
          },
          {
            role: "user",
            content: `
LANGUE: ${userLang}
TEMPS: ${temps}
TRAVAIL: ${travail}
NONNEG: ${nonneg}
`
          }
        ],
        temperature: 0.3,
        max_tokens: 600
      });

      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          rulesText = parsed.rules || rulesText;
          profileText = parsed.profile || profileText;
        } catch {
          rulesText = raw;
        }
      }
    } catch (err) {
      console.warn("⚠️ OpenAI ignoré :", err.message);
    }
  }

  db.run(
    `INSERT INTO rules VALUES (?,?,?,?,?)`,
    [id, userId, rulesText, profileText, new Date().toISOString()],
    () => {
      res.json({
        success: true,
        id,
        pageUrl: `https://${host}/r/${id}`,
        downloadUrl: `https://${host}/rules/${id}`
      });
    }
  );
});

/* =========================
   ADMIN – voir utilisateurs
========================= */
app.get('/admin/users', requireAdmin, (req, res) => {
  db.all(`SELECT id, username, email FROM users`, (err, rows) => {
    res.json(rows);
  });
});

/* =========================
   Télécharger RULES.txt
========================= */
app.get('/rules/:id', (req, res) => {
  db.get(
    `SELECT rulesText FROM rules WHERE id=?`,
    [req.params.id],
    (err, row) => {
      if (!row) return res.sendStatus(404);
      res.type('text/plain').send(row.rulesText);
    }
  );
});

/* =========================
   Page publique
========================= */
app.get('/r/:id', (req, res) => {
  db.get(
    `SELECT * FROM rules WHERE id=?`,
    [req.params.id],
    (err, row) => {
      if (!row) return res.send("RULES introuvable");

      const host = process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host');
      const pageUrl = `https://${host}/r/${row.id}`;

      res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>RULES</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<h2>📜 RULES</h2>
<pre>${row.rulesText}</pre>

<h3>🧠 Profil</h3>
<pre>${row.profileText}</pre>

<a href="/rules/${row.id}">⬇️ Télécharger RULES.txt</a><br><br>
<a target="_blank"
href="https://wa.me/?text=${encodeURIComponent("Voici mes règles : " + pageUrl)}">
Partager WhatsApp
</a>
</body>
</html>
`);
    }
  );
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
