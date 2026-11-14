// Clés et phrases secrètes : elles sont chiffrées par le système — Windows (safeStorage, DPAPI) et
// Android (keystore matériel, via le plugin BoussoleKeychain) — et rangées à part : le stockage
// principal de l'application n'en contient JAMAIS en clair, et le fichier de sauvegarde non plus.
// Dans le navigateur (développement), la clé reste dans le stockage local de l'application.

import type { Settings } from '../types';
import { isElectron } from './platform';

/** Les valeurs qui ne doivent jamais trainer en clair dans le stockage de l'application. */
export const SECRET_KEYS = ['anthropicKey', 'compatKey', 'mistralKey', 'coingeckoKey', 'syncToken', 'syncPassphrase'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const SEALED_KEY = 'boussole-sealed';

function bridge(): { sealSecret: (v: string) => Promise<string | null>; openSecret: (v: string) => Promise<string | null> } | null {
  if (isElectron) {
    const d = (window as unknown as { boussoleDesktop?: { sealSecret?: unknown; openSecret?: unknown } }).boussoleDesktop;
    if (!d || typeof d.sealSecret !== 'function' || typeof d.openSecret !== 'function') return null;
    return d as { sealSecret: (v: string) => Promise<string | null>; openSecret: (v: string) => Promise<string | null> };
  }
  // Android : le keystore matériel, via le plugin natif BoussoleKeychain (AES-256-GCM, la clé ne sort jamais).
  if (typeof window === 'undefined') return null; // hors navigateur (tests Node) : pas de keystore
  const cap = (window as unknown as {
    Capacitor?: {
      isPluginAvailable?: (name: string) => boolean;
      Plugins?: Record<string, { sealSecret?: (a: { value: string }) => Promise<{ blob: string }>; openSecret?: (a: { blob: string }) => Promise<{ value: string }> } | undefined>;
    };
  }).Capacitor;
  const kc = cap?.Plugins?.['BoussoleKeychain'];
  if (cap?.isPluginAvailable?.('BoussoleKeychain') && kc?.sealSecret && kc.openSecret) {
    return {
      sealSecret: async (v) => (await kc.sealSecret!({ value: v })).blob,
      openSecret: async (v) => (await kc.openSecret!({ blob: v })).value,
    };
  }
  return null;
}

/** Vrai quand cet appareil sait chiffrer les secrets par le système. */
export function secretsSealed(): boolean {
  return bridge() != null;
}

// Les écritures sont chaînées : la dernière gagne toujours, sans course entre deux modifications rapprochées.
let chain: Promise<unknown> = Promise.resolve();

/** Chiffre les secrets en cours et les range à part (appelée après chaque modification des réglages). */
export function saveSecrets(settings: Settings): void {
  const d = bridge();
  if (!d) return;
  chain = chain
    .then(async () => {
      const values: Record<string, string | null> = {};
      for (const k of SECRET_KEYS) {
        const v = settings[k];
        values[k] = typeof v === 'string' && v ? await d.sealSecret(v) : null;
      }
      localStorage.setItem(SEALED_KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), values }));
    })
    .catch(() => undefined);
}

/** Récupère les secrets scellés au démarrage (ce qu'on ne peut pas déchiffrer est ignoré sans tout casser). */
export async function loadSecrets(): Promise<Partial<Pick<Settings, SecretKey>>> {
  const d = bridge();
  if (!d) return {};
  let raw: string | null = null;
  try { raw = localStorage.getItem(SEALED_KEY); } catch { return {}; }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { values?: Record<string, string | null> };
    const out: Partial<Record<SecretKey, string>> = {};
    for (const k of SECRET_KEYS) {
      const blob = parsed.values?.[k];
      if (typeof blob === 'string' && blob) {
        const v = await d.openSecret(blob);
        if (typeof v === 'string' && v) out[k] = v;
      }
    }
    return out;
  } catch { return {}; }
}

/** Réglages sans les secrets : c'est ce qui part dans le stockage principal de l'application. */
export function stripSecrets(settings: Settings): Settings {
  const out = { ...settings } as Record<string, unknown>;
  for (const k of SECRET_KEYS) delete out[k];
  return out as unknown as Settings;
}
