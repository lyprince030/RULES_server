/* =========================
   Détection de la langue du navigateur
========================= */
const userLang = navigator.language || navigator.userLanguage; // ex: fr-FR, en-US

/* =========================
   Petite sanitation client (anti XSS basique)
========================= */
function sanitize(str) {
  return String(str)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

/* =========================
   Vérifier si utilisateur déjà connecté
========================= */
async function checkUser() {
  try {
    const res = await fetch('/me', {
      credentials: 'include' // 🔐 cookies sécurisés
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.logged) {
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('formSection').style.display = 'block';
    }
  } catch (err) {
    console.error("Erreur vérification utilisateur :", err);
  }
}
checkUser();

/* =========================
   Inscription / Connexion
========================= */
document.getElementById('registerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; // 🔐 anti double clic

  const username = sanitize(document.getElementById('username').value);
  const email = sanitize(document.getElementById('email').value);

  if (!username || !email) {
    alert("Remplissez tous les champs");
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // 🔐 cookies
      body: JSON.stringify({ username, email })
    });

    if (!res.ok) throw new Error("Erreur serveur");

    const data = await res.json();
    if (data.success) {
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('formSection').style.display = 'block';
    } else {
      alert("Erreur lors de l'inscription");
    }
  } catch (err) {
    console.error("Erreur inscription :", err);
    alert("Erreur lors de l'inscription. Réessayez.");
  } finally {
    btn.disabled = false;
  }
});

/* =========================
   Génération RULES.txt + page publique
========================= */
document.getElementById('rulesForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = document.querySelector('#rulesForm button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true; // 🔐 anti spam

  const temps = sanitize(document.getElementById('temps').value);
  const travail = sanitize(document.getElementById('travail').value);
  const nonneg = sanitize(document.getElementById('nonnegociables').value);

  if (!temps || !travail || !nonneg) {
    alert("Remplissez toutes les sections");
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  try {
    const response = await fetch('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // 🔐 cookies
      body: JSON.stringify({
        temps,
        travail,
        nonneg,
        lang: userLang
      })
    });

    if (!response.ok) throw new Error("Erreur serveur");

    const data = await response.json();

    if (!data.url) {
      alert("Erreur lors de la génération du RULES.txt");
      return;
    }

    const pageUrl = data.url;
    const downloadUrl = pageUrl.replace('/r/', '/rules/');
    const whatsappLink = `https://api.whatsapp.com/send?text=${encodeURIComponent(pageUrl)}`;
    const telegramLink = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}`;
    const shareDiv = document.getElementById('shareLink');

    shareDiv.innerHTML = `
      <p><a href="${downloadUrl}" target="_blank" rel="noopener">⬇️ Télécharger RULES.txt</a></p>
      <p><a href="${pageUrl}" target="_blank" rel="noopener">🌐 Voir la page publique</a></p>
      <p><a href="${whatsappLink}" target="_blank" rel="noopener">📲 Partager sur WhatsApp</a></p>
      <p><a href="${telegramLink}" target="_blank" rel="noopener">📨 Partager sur Telegram</a></p>
      <p>
        Lien à copier :
        <input type="text" value="${pageUrl}" readonly onclick="this.select()">
      </p>
      <p style="color:gray;font-size:0.9em;">
        ⚠️ Si le profil IA n'est pas généré, seules les règles sont disponibles (fallback garanti)
      </p>
    `;

    shareDiv.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error("Erreur génération RULES :", err);
    alert("Erreur lors de la génération du RULES.txt. Réessayez.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});
