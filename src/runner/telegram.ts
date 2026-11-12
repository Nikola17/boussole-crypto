// Envoi Telegram (bot créé avec @BotFather, conversation privée avec toi seul).
// Requêtes nues vers l'API Bot : aucune dépendance, aucun webhook — le runner n'appelle que vers l'extérieur.

export interface TgUpdate {
  chatId: string;
  /** Nom de la conversation telle que Telegram la donne (ton prénom pour un chat privé). */
  title: string;
  /** Horodatage du dernier message reçu (secondes). */
  date: number;
}

async function post<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: T };
  if (!res.ok || !j.ok) {
    const why = j.description ? ` : ${j.description}` : '';
    if (/chat not found/i.test(why)) throw new Error('Telegram : conversation introuvable — envoie un message à ton bot, puis relance avec --discover.');
    throw new Error(`Telegram a refusé ${method}${why || ` (réponse ${res.status})`}.`);
  }
  return j.result as T;
}

/** Envoie un message texte (limite Telegram : 4096 caractères — le brief est bien en dessous). */
export async function sendMessage(token: string, chatId: string, text: string): Promise<void> {
  if (text.length > 4096) text = `${text.slice(0, 4090)}\n…`;
  await post<unknown>(token, 'sendMessage', { chat_id: chatId, text }); // l'API attend « chat_id », pas « chatId »
}

/** Dernières conversations vues par le bot (pour la commande --discover : trouver ton chat id). */
export async function recentChats(token: string): Promise<TgUpdate[]> {
  const r = await post<{ message?: { chat: { id: number | string; first_name?: string; title?: string; type: string }; date: number } }[]>(token, 'getUpdates', { timeout: 0, limit: 20 });
  const seen = new Map<string, TgUpdate>();
  for (const u of r ?? []) {
    const c = u.message?.chat;
    if (!c || c.type !== 'private') continue; // on ne liste que les conversations privées
    const key = String(c.id);
    seen.set(key, { chatId: key, title: c.first_name ?? c.title ?? '', date: u.message?.date ?? 0 });
  }
  return [...seen.values()].sort((a, b) => b.date - a.date);
}
