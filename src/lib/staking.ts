// Rendement et staking : une courte liste d'options reconnues, leur rendement lu sur DefiLlama, et ce que cela rapporte
// à TA taille. Règle de fond : on n'achète jamais un jeton pour son rendement.

export type YieldKind = 'staking' | 'stablecoin';

export interface YieldOption {
  /** Identifiant du pool DefiLlama. */
  id: string;
  label: string;
  project: string;
  coinId: string;
  symbol: string;
  chain: string;
  kind: YieldKind;
  /** 1 = le plus classique, 3 = le plus risqué. */
  risk: 1 | 2 | 3;
  risks: string[];
  howTo: string;
}

export const YIELD_OPTIONS: YieldOption[] = [
  { id: '747c1d2a-c668-4682-b9f9-296708a3dd90', label: 'Lido (stETH)', project: 'Lido', coinId: 'ethereum', symbol: 'ETH', chain: 'Ethereum', kind: 'staking', risk: 1,
    risks: ['faille du contrat intelligent', 'stETH qui s’écarte temporairement de l’ETH', 'sanctions de validateurs (slashing)'], howTo: 'Depuis ton Ledger connecté au site officiel de Lido (vérifie bien l’adresse). Tu reçois du stETH, dont la quantité augmente.' },
  { id: '46bd2bdf-6d92-4066-b482-e885ee172264', label: 'ether.fi (weETH)', project: 'ether.fi', coinId: 'ethereum', symbol: 'ETH', chain: 'Ethereum', kind: 'staking', risk: 2,
    risks: ['faille du contrat intelligent', 'risques supplémentaires du « restaking »', 'weETH qui s’écarte de l’ETH'], howTo: 'Via le site officiel d’ether.fi avec ton wallet. Un peu plus de rendement, un peu plus de risques que Lido.' },
  { id: 'd4b3c522-6127-4b89-bedf-83641cdcd2eb', label: 'Rocket Pool (rETH)', project: 'Rocket Pool', coinId: 'ethereum', symbol: 'ETH', chain: 'Ethereum', kind: 'staking', risk: 1,
    risks: ['faille du contrat intelligent', 'rETH qui s’écarte de l’ETH', 'sanctions de validateurs (slashing)'], howTo: 'Via le site officiel de Rocket Pool avec ton wallet. Plus décentralisé que Lido, rendement un peu plus faible.' },
  { id: '0e7d0722-9054-4907-8593-567b353c0900', label: 'Jito (JitoSOL)', project: 'Jito', coinId: 'solana', symbol: 'SOL', chain: 'Solana', kind: 'staking', risk: 2,
    risks: ['faille du contrat intelligent', 'JitoSOL qui s’écarte du SOL', 'retrait possible avec un délai'], howTo: 'Depuis Phantom ou le site officiel de Jito. Tu reçois du JitoSOL.' },
  { id: 'b3f93865-5ec8-4662-90a0-11808e0aa2bd', label: 'Marinade (mSOL)', project: 'Marinade', coinId: 'solana', symbol: 'SOL', chain: 'Solana', kind: 'staking', risk: 2,
    risks: ['faille du contrat intelligent', 'mSOL qui s’écarte du SOL'], howTo: 'Depuis Phantom ou le site officiel de Marinade. Tu reçois du mSOL.' },
  { id: '52bd72a7-9e81-4112-abb4-71673e8de9bf', label: 'Jupiter (JupSOL)', project: 'Jupiter', coinId: 'solana', symbol: 'SOL', chain: 'Solana', kind: 'staking', risk: 2,
    risks: ['faille du contrat intelligent', 'JupSOL qui s’écarte du SOL'], howTo: 'Depuis Phantom ou l’application de Jupiter. Tu reçois du JupSOL.' },
  { id: '9f25a954-db87-4bb2-a8b2-4be0b843a44c', label: 'Kinetiq (kHYPE)', project: 'Kinetiq', coinId: 'hyperliquid', symbol: 'HYPE', chain: 'Hyperliquid', kind: 'staking', risk: 3,
    risks: ['protocole récent', 'faille du contrat intelligent', 'kHYPE qui s’écarte du HYPE', 'rendement faible pour le risque'], howTo: 'Demande un portefeuille compatible Hyperliquid : à ta taille, le jeu n’en vaut pas la chandelle.' },
  { id: 'aa70268e-4b52-42bf-a116-608b370f9501', label: 'Aave (USDC)', project: 'Aave', coinId: 'usd-coin', symbol: 'USDC', chain: 'Ethereum', kind: 'stablecoin', risk: 1,
    risks: ['faille du contrat intelligent', 'perte du lien avec le dollar (USDC)', 'frais de transaction élevés sur Ethereum pour de petits montants'], howTo: 'Via l’application officielle d’Aave avec ton wallet : tu prêtes ton USDC et reçois des intérêts.' },
  { id: '43641cf5-a92e-416b-bce9-27113d3c0db6', label: 'Maple (Syrup USDC)', project: 'Maple', coinId: 'usd-coin', symbol: 'USDC', chain: 'Ethereum', kind: 'stablecoin', risk: 3,
    risks: ['risque de crédit : des emprunteurs institutionnels peuvent ne pas rembourser', 'retrait possible avec un délai', 'faille du contrat intelligent'], howTo: 'Via le site officiel de Maple. Rendement plus élevé parce que le risque de crédit l’est aussi.' },
];

export interface YieldQuote {
  apy: number | null;
  apyBase: number | null;
  tvlUsd: number | null;
}

export type YieldVerdict = 'ok' | 'skip' | 'none' | 'unknown';

export interface YieldRow {
  option: YieldOption;
  quote: YieldQuote | null;
  positionUsd: number;
  gainYearUsd: number | null;
  verdict: YieldVerdict;
}

/**
 * `minGainUsd` : en dessous de ce gain annuel, ce n'est pas la peine de prendre un risque supplémentaire
 * (contrat intelligent, écart de prix du jeton dérivé, frais de transaction).
 */
export function yieldRows(options: YieldOption[], quotes: Record<string, YieldQuote | null | undefined>, positionsUsd: Record<string, number>, minGainUsd: number): YieldRow[] {
  return options.map((option) => {
    const quote = quotes[option.id] ?? null;
    const positionUsd = positionsUsd[option.coinId] ?? 0;
    if (!quote || quote.apy == null) return { option, quote, positionUsd, gainYearUsd: null, verdict: 'unknown' };
    if (positionUsd <= 0) return { option, quote, positionUsd, gainYearUsd: 0, verdict: 'none' };
    const gain = (positionUsd * quote.apy) / 100;
    return { option, quote, positionUsd, gainYearUsd: gain, verdict: gain < minGainUsd ? 'skip' : 'ok' };
  });
}
