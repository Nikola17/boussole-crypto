// Chiffrement de bout en bout de la synchronisation : AES-GCM 256 bits, clé dérivée de la phrase de
// passe par PBKDF2-SHA256 (600 000 itérations). Le dépôt GitHub ne reçoit qu'un fichier illisible ;
// une phrase de passe fautive est refusée sans équivoque par l'intégrité du mode GCM.

const PREFIX = 'BC1';
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const te = new TextEncoder();
const td = new TextDecoder();

function bytesToB64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Trop courte : la phrase de passe protège tout ton portefeuille côté GitHub. */
export function checkPassphrase(passphrase: string): string | null {
  const p = passphrase.trim();
  if (p.length < 8) return 'Choisis une phrase de passe d’au moins 8 caractères (elle ne quitte jamais cet appareil).';
  return null;
}

/** Chiffre une valeur JSON : `BC1|sel|iv|chiffré`, le tout en base 64. */
export async function seal(value: unknown, passphrase: string): Promise<string> {
  if (checkPassphrase(passphrase)) throw new Error(checkPassphrase(passphrase) as string);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase.trim(), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, te.encode(JSON.stringify(value))));
  return `${PREFIX}|${bytesToB64(salt)}|${bytesToB64(iv)}|${bytesToB64(ct)}`;
}

/** Déchiffre : la moindre différence de phrase de passe (ou de contenu) est refusée explicitement. */
export async function unseal(sealed: string, passphrase: string): Promise<unknown> {
  const parts = sealed.split('|');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('Le fichier de synchronisation n’a pas le format attendu (Boussole chiffré v1).');
  let value: unknown;
  try {
    const key = await deriveKey(passphrase.trim(), b64ToBytes(parts[1]));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(parts[2]) as unknown as BufferSource }, key, b64ToBytes(parts[3]) as unknown as BufferSource);
    value = JSON.parse(td.decode(plain));
  } catch {
    throw new Error('Phrase de passe incorrecte, ou fichier endommagé pendant le transfert.');
  }
  return value;
}
