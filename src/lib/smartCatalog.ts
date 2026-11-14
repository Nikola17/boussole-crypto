// Wallets publics connus, proposés au suivi selon ton portefeuille. Fonction pure, testée.
//
// Chaque adresse a été vérifiée le 14 nov. 2026 sur son étiquette publique Etherscan (« Public Name Tag ») ou son
// nom ENS. Aucune adresse Solana ni Base n'a pu être attribuée de façon fiable à une entité connue : la liste
// n'en contient pas plutôt que d'en deviner une. Le suivi lit les transferts de tokens ERC-20 (pas l'ETH natif) :
// une vente d'ETH apparaît comme un achat de stablecoins (USDC, DAI…) ou un mouvement de WETH.

import type { Bucket, SmartWallet } from '../types';

export interface CatalogWallet {
  key: string;
  label: string;
  chain: SmartWallet['chain'];
  address: string;
  kind: SmartWallet['kind'];
  /** Ce qu'on surveille chez lui, en une phrase. */
  why: string;
  /** Cryptos (identifiants CoinGecko) dont il est un acteur direct : fondation, trésorerie, équipe. */
  coins?: string[];
  /** Thèmes : teneur de marché des altcoins, investisseur en petites capis, baleine. */
  themes: ('alts' | 'gems' | 'whale')[];
  /** Source de l'attribution, affichée pour que tu puisses vérifier. */
  source: string;
}

export const SMART_CATALOG: CatalogWallet[] = [
  {
    key: 'vitalik', label: 'Vitalik Buterin', chain: 'eth', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', kind: 'insider',
    why: 'Cofondateur d’Ethereum : ses ventes de tokens reçus et ses mouvements de WETH sont scrutés par tout le marché.',
    coins: ['ethereum'], themes: ['whale'], source: 'ENS vitalik.eth',
  },
  {
    key: 'ef', label: 'Ethereum Foundation', chain: 'eth', address: '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe', kind: 'insider',
    why: 'La Fondation finance ses dépenses en vendant de l’ETH : un achat de stablecoins de sa part, c’est une vente d’ETH.',
    coins: ['ethereum'], themes: [], source: 'Etherscan « EthDev » (Ethereum Foundation)',
  },
  {
    key: 'ef-defi', label: 'Ethereum Foundation — trésorerie DeFi', chain: 'eth', address: '0x9fC3dc011b461664c835F2527fffb1169b3C213e', kind: 'insider',
    why: 'Le portefeuille où passent les conversions de la Fondation (ETH ↔ stablecoins, prêts DeFi).',
    coins: ['ethereum'], themes: [], source: 'Etherscan « EF: DeFi Multisig »',
  },
  {
    key: 'uni-timelock', label: 'Uniswap — trésorerie (UNI Timelock)', chain: 'eth', address: '0x1a9C8182C09F50C8318d769245beA52c32BE35BC', kind: 'insider',
    why: 'La trésorerie de la gouvernance Uniswap : ses sorties d’UNI annoncent des distributions ou des ventes.',
    coins: ['uniswap'], themes: [], source: 'Etherscan « Uniswap V2: UNI Timelock »',
  },
  {
    key: 'wintermute', label: 'Wintermute', chain: 'eth', address: '0x0000006daea1723962647b7e189d311d757fb793', kind: 'fund',
    why: 'Teneur de marché majeur : de gros dépôts d’un token vers les plateformes précèdent souvent une pression vendeuse.',
    themes: ['alts'], source: 'Etherscan « Wintermute 1 »',
  },
  {
    key: 'jump', label: 'Jump Trading', chain: 'eth', address: '0xf584F8728B874a6a5c7A8d4d387C9aae9172D621', kind: 'fund',
    why: 'Société de trading et teneur de marché : ses entrées et sorties pèsent sur les altcoins qu’elle traite.',
    themes: ['alts'], source: 'Etherscan « Jump Trading »',
  },
  {
    key: 'dwf', label: 'DWF Labs', chain: 'eth', address: '0xD4B69e8D62C880E9DD55d419d5E07435C3538342', kind: 'fund',
    why: 'Teneur de marché et investisseur très actif sur les petites capitalisations, souvent avant les grosses annonces.',
    themes: ['gems', 'alts'], source: 'Etherscan « DWF Labs »',
  },
  {
    key: 'a16z', label: 'a16z (Andreessen Horowitz)', chain: 'eth', address: '0x05E793cE0C6027323Ac150F6d45C2344d28B6019', kind: 'fund',
    why: 'Fonds de capital-risque : ses ventes de tokens de gouvernance reçus signalent des sorties d’investisseurs.',
    themes: ['gems', 'alts'], source: 'Etherscan « a16z »',
  },
  {
    key: 'justin-sun', label: 'Justin Sun', chain: 'eth', address: '0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296', kind: 'kol',
    why: 'Une des plus grosses baleines d’Ethereum : ses dépôts massifs sur les plateformes font bouger les cours.',
    coins: ['tron', 'bittorrent', 'just', 'sun-token'], themes: ['whale'], source: 'Etherscan « Justin Sun »',
  },
  {
    key: 'machi', label: 'Machi Big Brother', chain: 'eth', address: '0x020cA66C30beC2c4Fe3861a94E4DB4A498A35872', kind: 'kol',
    why: 'Trader très exposé et souvent liquidé : un thermomètre de la spéculation, à observer, jamais à copier.',
    themes: ['gems'], source: 'ENS machibigbrother.eth',
  },
];

export interface HoldingLike {
  coinId?: string;
  symbol: string;
  valueUsd: number;
  bucket: Bucket;
}

export interface Recommendation {
  wallet: CatalogWallet;
  score: number;
  reasons: string[];
}

const pct = (x: number) => `${String(Math.round(x * 10) / 10).replace('.', ',')} %`;

/**
 * Les wallets du catalogue classés selon ton portefeuille : d'abord les acteurs des cryptos que tu détiens
 * (pondérés par leur poids), puis les teneurs de marché si tu as des altcoins, les investisseurs en pépites si tu
 * en as ou si elles t'intéressent. Ceux que tu suis déjà sont écartés.
 */
export function recommendSmartWallets(holdings: HoldingLike[], followed: Pick<SmartWallet, 'address' | 'chain'>[], opts: { likesGems?: boolean } = {}): Recommendation[] {
  const total = holdings.reduce((s, h) => s + Math.max(0, h.valueUsd), 0);
  const weight = new Map<string, number>();
  for (const h of holdings) if (h.coinId && h.valueUsd > 0) weight.set(h.coinId, (weight.get(h.coinId) ?? 0) + (total > 0 ? (h.valueUsd / total) * 100 : 0));
  const bucketPct = (b: Bucket[]) => holdings.filter((h) => b.includes(h.bucket)).reduce((s, h) => s + Math.max(0, h.valueUsd), 0) / (total || 1) * 100;
  const altPct = total > 0 ? bucketPct(['large', 'mid', 'small']) : 0;
  const smallPct = total > 0 ? bucketPct(['small']) : 0;
  const isFollowed = (w: CatalogWallet) => followed.some((f) => f.chain === w.chain && f.address.toLowerCase() === w.address.toLowerCase());

  const out: Recommendation[] = [];
  for (const w of SMART_CATALOG) {
    if (isFollowed(w)) continue;
    let score = 0;
    const reasons: string[] = [];
    for (const id of w.coins ?? []) {
      const p = weight.get(id);
      if (p != null && p > 0) {
        score += 50 + p;
        const sym = holdings.find((h) => h.coinId === id)?.symbol.toUpperCase() ?? id;
        reasons.push(`Tu détiens ${sym} (${pct(p)} de ton portefeuille).`);
      }
    }
    if (w.themes.includes('alts') && altPct > 0) {
      score += 20 + Math.min(30, altPct);
      reasons.push(`Tes altcoins pèsent ${pct(altPct)} : les teneurs de marché font la liquidité de ces tokens.`);
    }
    if (w.themes.includes('gems') && (smallPct > 0 || opts.likesGems)) {
      score += 15 + Math.min(20, smallPct * 2);
      reasons.push(smallPct > 0 ? `Tu as ${pct(smallPct)} en petites capitalisations.` : 'Tu t’intéresses aux pépites.');
    }
    if (w.themes.includes('whale')) {
      score += 5;
      if (!reasons.length) reasons.push('Une baleine dont les mouvements font réagir tout le marché.');
    }
    out.push({ wallet: w, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}
