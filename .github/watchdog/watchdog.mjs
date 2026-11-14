// L'œil du gardien — ce script ne tourne PAS sur le VPS : il tourne chez GitHub Actions, précisément
// pour prévenir même si le VPS tombe. Toutes les 20 minutes :
//   1. il lit « heartbeat.json » (le battement de vie que le runner pousse dans le dépôt de sync toutes
//      les 10 minutes ; un simple horodatage, aucun secret) ;
//   2. plus de 45 minutes de silence → message Telegram « hermes est muet » (au mieux une fois toutes
//      les 2 h, le décompte vit dans « watchdog.json » du même dépôt) ;
//   3. si le battement revient après une alerte → message « hermes est de retour » et remise à zéro.
// Sans les secrets (SYNC_PAT, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID), le script échoue : GitHub envoie son
// mail d'échec de workflow — l'œil ne dort jamais complètement.

const SYNC_REPO = process.env.SYNC_REPO || 'Nikola17/boussole-sync';
const STALE_MS = 45 * 60 * 1000; // un battement toutes les 10 min : trois ratés d'affilée = alerte
const REPEAT_MS = 2 * 60 * 60 * 1000; // le VPS peut rester muet longtemps : on ne spamme pas au-delà d'un rappel / 2 h

const { SYNC_PAT, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (!SYNC_PAT || !TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Secrets manquants (SYNC_PAT, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID) : le gardien ne peut pas veiller.');
  process.exit(1);
}

const api = async (path, init, token = SYNC_PAT) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return res;
};

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const unb64 = (b64string) => Buffer.from(b64string, 'base64').toString('utf8');

/** Lit un fichier du dépôt de sync (contenu brut). null : absent (le runner ne l'a jamais écrit). */
async function readSync(path) {
  const res = await api(`/repos/${SYNC_REPO}/contents/${encodeURI(path)}`, { headers: { Accept: 'application/vnd.github.raw' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lecture ${path} impossible (${res.status}).`);
  return await res.json();
}

/** Écrit (ou remplace) un fichier du dépôt de sync : contenu brut, message net sans secret. */
async function writeSync(path, data, message) {
  const current = await api(`/repos/${SYNC_REPO}/contents/${encodeURI(path)}`);
  const sha = current.ok ? (await current.json()).sha : null;
  const res = await api(`/repos/${SYNC_REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64(JSON.stringify(data)), ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`Écriture ${path} refusée (${res.status}).`);
}

const ago = (ms) => (ms < 60 * 60 * 1000 ? `${Math.round(ms / 60000)} min` : `${(ms / 3600000).toFixed(1)} h`);

async function telegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID.trim(), text }),
  });
  if (!res.ok) throw new Error(`Telegram a refusé le message (${res.status}).`);
}

async function main() {
  const heartbeat = await readSync('heartbeat.json').catch((e) => { console.error(`Battement illisible : ${e.message}`); return null; });
  const watch = (await readSync('watchdog.json').catch(() => null)) ?? { lastAlertAt: null };
  const now = Date.now();

  if (heartbeat && typeof heartbeat.at === 'string' && Number.isFinite(Date.parse(heartbeat.at))) {
    const age = now - Date.parse(heartbeat.at);
    if (age > STALE_MS) {
      if (watch.lastAlertAt == null || now - watch.lastAlertAt >= REPEAT_MS) {
        await telegram(`Boussole — le serveur veilleur n'a plus donné signe de vie depuis ${ago(age)}.\nVérifie le VPS : sudo systemctl status boussole-runner. Les alertes de prix n'arrivent plus tant qu'il est muet.`);
        await writeSync('watchdog.json', { lastAlertAt: now }, 'Boussole : le gardien avertit d’un silence du serveur');
        console.log(`Silence de ${ago(age)} : alerte envoyée.`);
      } else {
        console.log(`Silence de ${ago(age)} déjà signalé il y a ${ago(now - watch.lastAlertAt)} : pas de spam.`);
      }
    } else if (watch.lastAlertAt != null) {
      await telegram('Boussole — le serveur veilleur est de retour, la surveillance (prix, paliers) reprend son cours.');
      await writeSync('watchdog.json', { lastAlertAt: null }, 'Boussole : le serveur veilleur est de retour');
      console.log('Retour du serveur : message envoyé, compteur remis à zéro.');
    } else {
      console.log(`Serveur vivant (battement il y a ${ago(age)}). Rien à signaler.`);
    }
  } else {
    // Pas de battement du tout : le runner n'a jamais tourné (ou le fichier a disparu) — première alerte immédiate.
    if (watch.lastAlertAt == null || now - watch.lastAlertAt >= REPEAT_MS) {
      await telegram('Boussole — aucun battement de vie du serveur veilleur dans le dépôt de synchronisation.\nVérifie le VPS : sudo systemctl status boussole-runner.');
      await writeSync('watchdog.json', { lastAlertAt: now }, 'Boussole : aucun battement de vie du serveur');
      console.log('Aucun battement : alerte envoyée.');
    }
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
