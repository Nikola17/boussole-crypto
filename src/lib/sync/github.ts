// Transport : un seul fichier chiffré dans un dépôt GitHub privé, via l'API REST.
// Le jeton fourni doit être *fine-grained* et limité à ce seul dépôt (permission « Contents » : lecture + écriture).
// Avant d'écrire, l'application reçoit l'empreinte (sha) du fichier distant : GitHub refuse l'écriture si le
// fichier a changé entre-temps — une modification de l'autre appareil ne peut jamais être écrasée.

export interface RemoteFile {
  /** Empreinte du fichier distant (null : le fichier n'existe pas encore). */
  sha: string | null;
  /** Contenu décodé (texte chiffré « BC1|… »). */
  content: string;
}

export const CONFLICT = 'conflict';

function api(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

function repoUrl(repo: string, path: string): string {
  const clean = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) throw new Error('Dépôt mal formé : attends « utilisateur/dépôt » (ex : Nikola17/boussole-sync).');
  return `https://api.github.com/repos/${clean}/contents/${path}`;
}

function bytesToB64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function b64ToString(b64: string): Promise<string> {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Lit le fichier chiffré. Retourne null s'il n'existe pas encore (première synchronisation). */
export async function fetchRemote(repo: string, path: string, token: string): Promise<RemoteFile | null> {
  const res = await api(repoUrl(repo, path), token);
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Jeton GitHub refusé (vérifie sa validité et son accès au dépôt).');
    if (res.status === 403) throw new Error(`Accès refusé par GitHub${msg.message ? ` : ${msg.message}` : ''} (le jeton doit pouvoir lire le dépôt de synchronisation).`);
    throw new Error(`Lecture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ''}).`);
  }
  const j = (await res.json()) as { sha: string; content?: unknown; encoding?: string };
  if (typeof j.content !== 'string') throw new Error('Le fichier de synchronisation distant est illisible (contenu vide ou trop gros pour l’API).');
  return { sha: j.sha, content: await b64ToString(j.content) };
}

/**
 * Lit un fichier NON chiffré du dépôt de sync (signal de vie du serveur, dernière version…), contenu texte.
 * Retourne null s'il n'existe pas encore : jamais d'erreur pour un fichier facultatif.
 */
export async function fetchRaw(repo: string, path: string, token: string): Promise<string | null> {
  const res = await api(repoUrl(repo, path), token);
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.message ? `Lecture GitHub impossible (${res.status} : ${msg.message}).` : `Lecture GitHub impossible (${res.status}).`);
  }
  const j = (await res.json()) as { content?: unknown; encoding?: string };
  if (typeof j.content !== 'string') throw new Error('Le fichier distant est illisible.');
  return await b64ToString(j.content);
}

/** Écrit le fichier chiffré ; garantit que l'on n'écrase jamais une modification inconnue. */
export async function pushRemote(repo: string, path: string, token: string, content: string, knownSha: string | null): Promise<void> {
  const body: Record<string, unknown> = { message: 'Boussole : synchronisation', content: bytesToB64(new TextEncoder().encode(content)) };
  if (knownSha) body.sha = knownSha;
  const res = await api(repoUrl(repo, path), token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return;
  const msg = await res.json().catch(() => ({}));
  if (res.status === 409 || res.status === 422) throw new Error(CONFLICT);
  if (res.status === 401) throw new Error('Jeton GitHub refusé (vérifie sa validité et son accès au dépôt).');
  if (res.status === 403) throw new Error(`Écriture refusée par GitHub${msg.message ? ` : ${msg.message}` : ''} (le jeton doit avoir « Contents : Read and write » sur ce dépôt).`);
  throw new Error(`Écriture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ''}).`);
}
