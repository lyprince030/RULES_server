/* =========================
   Détection de la langue du navigateur
========================= */
const userLang = navigator.language || navigator.userLanguage; // ex: fr-FR, en-US

/* =========================
   Vérifier si utilisateur déjà connecté
========================= */
async function checkUser() {
  try {
    const res = await fetch('/me');
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
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!username || !email) {
    alert("Remplissez tous les champs");
    return;
  }

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email })
    });

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
  }
});

/* =========================
   Génération RULES.txt + page publique
========================= */
document.getElementById('rulesForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const temps = document.getElementById('temps').value.trim();
  const travail = document.getElementById('travail').value.trim();
  const nonneg = document.getElementById('nonnegociables').value.trim();

  if (!temps || !travail || !nonneg) {
    alert("Remplissez toutes les sections");
    return;
  }

  try {
    const response = await fetch('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temps,
        travail,
        nonneg,
        lang: userLang
      })
    });

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

    // Affiche toujours le résultat, même si OpenAI n'a pas généré le profil
    shareDiv.innerHTML = `
      <p><a href="${downloadUrl}" target="_blank">⬇️ Télécharger RULES.txt</a></p>
      <p><a href="${pageUrl}" target="_blank">🌐 Voir la page publique</a></p>
      <p><a href="${whatsappLink}" target="_blank">📲 Partager sur WhatsApp</a></p>
      <p><a href="${telegramLink}" target="_blank">📨 Partager sur Telegram</a></p>
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
  }
});
