// Webhook sortant (optionnel) : quand Boussole déclenche une alerte, ton URL reçoit un POST JSON.
// Boussole ne bloque jamais sur le webhook (délai borné, erreur ignorée) et n'envoie que l'événement.

export interface WebhookPayload {
  app: 'boussole-crypto';
  event: string;
  at: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export function buildWebhookPayload(event: string, title: string, body: string, data?: Record<string, unknown>): WebhookPayload {
  return { app: 'boussole-crypto', event, at: new Date().toISOString(), title, body, data };
}

/** Uniquement les URL https sont acceptées (pas de fuite vers un http interne). */
export function validWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** POST le payload, au mieux : renvoie false sans jamais lever si le destinataire est indisponible. */
export async function fireWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  if (!validWebhookUrl(url)) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
