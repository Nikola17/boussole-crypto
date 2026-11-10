// Dérivation locale des adresses Bitcoin d'un compte à partir de sa clé PUBLIQUE étendue (xpub / ypub / zpub).
// Aucune clé privée n'est demandée ni manipulée : une clé publique étendue ne permet que de LIRE les soldes.

import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';

export type BtcScript = 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh' | 'p2tr';
export type BtcScriptChoice = BtcScript | 'auto';

export const SCRIPT_LABEL: Record<BtcScript, string> = {
  p2wpkh: 'Native SegWit (bc1q…)',
  'p2sh-p2wpkh': 'SegWit (3…)',
  p2pkh: 'Legacy (1…)',
  p2tr: 'Taproot (bc1p…)',
};

/** Ordre d'essai pour un `xpub` : le format par défaut de Ledger Live d'abord. */
export const SCRIPT_ORDER: BtcScript[] = ['p2wpkh', 'p2sh-p2wpkh', 'p2tr', 'p2pkh'];

const VERSIONS = {
  xpub: { private: 0x0488ade4, public: 0x0488b21e },
  ypub: { private: 0x049d7121, public: 0x049d7cb2 },
  zpub: { private: 0x04b2430c, public: 0x04b24746 },
} as const;

const PUBLIC_KEY = /^[xyz]pub[1-9A-HJ-NP-Za-km-z]{100,112}$/;
const PRIVATE_KEY = /^[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,112}$/;

export function isExtendedKey(s: string): boolean {
  return PUBLIC_KEY.test(s.trim());
}

/** Une clé privée étendue (xprv…) ne doit JAMAIS être collée dans l'application. */
export function isExtendedPrivateKey(s: string): boolean {
  return PRIVATE_KEY.test(s.trim());
}

/** zpub → Native SegWit, ypub → SegWit ; un xpub ne dit pas son format (null). */
export function scriptForPrefix(key: string): BtcScript | null {
  const p = key.trim().slice(0, 4);
  if (p === 'zpub') return 'p2wpkh';
  if (p === 'ypub') return 'p2sh-p2wpkh';
  return null;
}

export function parseExtendedKey(key: string): HDKey {
  const k = key.trim();
  const prefix = k.slice(0, 4) as keyof typeof VERSIONS;
  if (!PUBLIC_KEY.test(k) || !VERSIONS[prefix]) throw new Error('Clé publique étendue invalide (attendu : xpub, ypub ou zpub).');
  const hd = HDKey.fromExtendedKey(k, VERSIONS[prefix]);
  if (hd.privateKey) throw new Error('Cette clé contient une clé privée : refusée.');
  return hd;
}

/** Adresse `index` de la chaîne de réception (0) ou de monnaie rendue (1). */
export function deriveAddress(hd: HDKey, script: BtcScript, change: 0 | 1, index: number): string {
  const pub = hd.deriveChild(change).deriveChild(index).publicKey;
  if (!pub) throw new Error('Dérivation impossible.');
  let address: string | undefined;
  switch (script) {
    case 'p2wpkh': address = btc.p2wpkh(pub).address; break;
    case 'p2sh-p2wpkh': address = btc.p2sh(btc.p2wpkh(pub)).address; break;
    case 'p2pkh': address = btc.p2pkh(pub).address; break;
    case 'p2tr': address = btc.p2tr(pub.slice(1)).address; break;
  }
  if (!address) throw new Error('Adresse introuvable.');
  return address;
}
