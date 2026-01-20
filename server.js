require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const shortid = require('shortid');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   GROQ (GRATUIT)
========================= */
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY manquante");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
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
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT
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
    `INSERT INTO users VALUES (?,?,?)`,
    [id, username, email],
    () => {
      res.cookie('userId', id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true
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
   CREATE RULES (ZERO ERREUR)
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

  /* ===== FALLBACK GARANTI ===== */
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

  /* ===== OpenAI (OPTIONNEL, NON BLOQUANT) ===== */
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Réponds STRICTEMENT en JSON valide :
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

  /* ===== INSERT TOUJOURS ===== */
  db.run(
    `INSERT INTO rules VALUES (?,?,?,?,?)`,
    [id, userId, rulesText, profileText, new Date().toISOString()],
    () => {
      res.json({
        success: true,
        url: `https://${host}/r/${id}`
      });
    }
  );
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
