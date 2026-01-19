/* =========================
   Détection de la langue du navigateur
========================= */
const userLang = navigator.language || navigator.userLanguage; // ex: "fr-FR", "en-US"

/* =========================
   Vérifier utilisateur déjà connecté
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
    console.error("Erreur lors de la vérification de l'utilisateur:", err);
  }
}
checkUser();

/* =========================
   Inscription / Connexion
========================= */
document.getElementById('registerBtn').addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  if (!username || !email) return alert("Remplissez tous les champs");

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email })
    });
    const data = await res.json();
    if (data.userId) {
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('formSection').style.display = 'block';
    }
  } catch (err) {
    console.error("Erreur lors de l'inscription:", err);
    alert("Erreur lors de l'inscription. Réessayez.");
  }
});

/* =========================
   Générer RULES.txt + profil IA (multi-langue)
========================= */
document.getElementById('rulesForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const temps = document.getElementById('temps').value.trim();
  const travail = document.getElementById('travail').value.trim();
  const nonneg = document.getElementById('nonnegociables').value.trim();

  if (!temps || !travail || !nonneg) return alert("Remplissez toutes les sections");

  try {
    // On envoie la langue au serveur pour que l'IA adapte le RULES.txt
    const response = await fetch('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temps, travail, nonneg, lang: userLang })
    });

    const data = await response.json();
    if (!data.url) return alert("Erreur lors de la génération du RULES.txt");

    const rulesUrl = data.url;

    // Générer les liens partageables
    const whatsappLink = `https://api.whatsapp.com/send?text=${encodeURIComponent(rulesUrl)}`;
    const telegramLink = `https://t.me/share/url?url=${encodeURIComponent(rulesUrl)}`;
    const copyLink = rulesUrl;

    // Affichage des liens dans la page
    const shareDiv = document.getElementById('shareLink');
    if (!shareDiv) {
      console.error("Erreur : div #shareLink introuvable");
      return;
    }

    shareDiv.innerHTML = `
      <p><a href="${rulesUrl}" target="_blank">⬇️ Télécharger RULES.txt</a></p>
      <p><a href="${whatsappLink}" target="_blank">📲 Partager sur WhatsApp</a></p>
      <p><a href="${telegramLink}" target="_blank">📨 Partager sur Telegram</a></p>
      <p>Lien à copier : <input type="text" value="${copyLink}" readonly></p>
    `;

    // Faire défiler vers le résultat
    shareDiv.scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    console.error("Erreur lors de la génération:", err);
    alert("Erreur lors de la génération du RULES.txt. Réessayez.");
  }
});
