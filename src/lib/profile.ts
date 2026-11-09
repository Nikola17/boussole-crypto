// Profil investisseur : questionnaire → archétype → allocation cible et règles de discipline.

import type { Archetype, Bucket, Profile, ProfileRules } from '../types';

export const ARCHETYPES: Record<Archetype, { target: Record<Bucket, number>; rules: ProfileRules; pitch: string }> = {
  Prudent: {
    target: { btc: 50, eth: 20, large: 10, mid: 0, small: 0, stable: 20 },
    rules: { maxPerGemPct: 1, maxPerAltPct: 5, cashReservePct: 20, riskPerTradePct: 0.5, maxLines: 8, minLinePct: 2, maxDiscoveryLines: 2 },
    pitch: 'Tu veux surtout protéger ton capital. Cœur Bitcoin/Ethereum, DCA régulier, très peu de paris spéculatifs.',
  },
  Équilibré: {
    target: { btc: 45, eth: 20, large: 15, mid: 5, small: 5, stable: 10 },
    rules: { maxPerGemPct: 2, maxPerAltPct: 8, cashReservePct: 10, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: 'Croissance raisonnable : un socle solide BTC/ETH et une petite poche pour les opportunités.',
  },
  Dynamique: {
    target: { btc: 35, eth: 20, large: 20, mid: 10, small: 10, stable: 5 },
    rules: { maxPerGemPct: 3, maxPerAltPct: 10, cashReservePct: 5, riskPerTradePct: 1.5, maxLines: 15, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: 'Tu acceptes une forte volatilité pour viser plus haut. Les altcoins prennent une vraie place.',
  },
  Audacieux: {
    target: { btc: 25, eth: 15, large: 20, mid: 15, small: 20, stable: 5 },
    rules: { maxPerGemPct: 5, maxPerAltPct: 15, cashReservePct: 5, riskPerTradePct: 2, maxLines: 20, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: 'Chasseur de multiplicateurs. Tu dois être prêt à voir -80 % sur une partie du portefeuille.',
  },
};

/** Règles complètes : complète les profils enregistrés avant l'ajout des règles anti-éparpillement. */
export function rulesOf(p: Pick<Profile, 'archetype' | 'rules'>): ProfileRules {
  return { ...ARCHETYPES[p.archetype]?.rules, ...p.rules };
}

export function scoreProfile(p: Pick<Profile, 'horizon' | 'riskTolerance' | 'experience' | 'maxLoss' | 'goal'>): number {
  // 5 à 18 points
  return p.horizon + p.riskTolerance + p.experience + p.maxLoss + p.goal;
}

export function archetypeFor(score: number): Archetype {
  if (score <= 8) return 'Prudent';
  if (score <= 11) return 'Équilibré';
  if (score <= 14) return 'Dynamique';
  return 'Audacieux';
}

export function defaultProfile(): Profile {
  return {
    completed: false,
    name: '',
    horizon: 3,
    riskTolerance: 3,
    experience: 2,
    maxLoss: 2,
    goal: 2,
    capital: 1000,
    monthlyBudget: 100,
    interests: { dca: true, trading: false, gems: true, airdrops: true },
    archetype: 'Équilibré',
    target: { ...ARCHETYPES['Équilibré'].target },
    rules: { ...ARCHETYPES['Équilibré'].rules },
  };
}

export const GOLDEN_RULES: { title: string; detail: string }[] = [
  { title: 'Le DCA est ton socle', detail: 'Investis un montant régulier sur BTC/ETH quoi qu’il arrive. Le temps passé sur le marché bat le timing.' },
  { title: 'Écris ta thèse avant d’acheter', detail: 'Si tu ne peux pas expliquer en 5 phrases pourquoi tu achètes, n’achète pas (test du miroir).' },
  { title: 'Définis ta sortie à l’entrée', detail: 'Paliers de prise de profits (×2, ×3, ×5) et conditions d’invalidation, fixés à froid.' },
  { title: 'Taille de position = gestion du risque', detail: 'Une pépite ne dépasse jamais ta limite par ligne. Tu dois pouvoir la perdre à 100 % sans souffrir.' },
  { title: 'Jamais d’argent emprunté ni de levier excessif', detail: 'Le levier transforme une correction normale en liquidation.' },
  { title: 'Achète la peur, vends l’euphorie', detail: '« Soyez craintif quand les autres sont avides, et avide quand les autres sont craintifs. » — Warren Buffett' },
  { title: 'Sécurité d’abord', detail: 'Wallet matériel pour le long terme, 2FA partout, jamais ta phrase secrète à qui que ce soit.' },
  { title: 'Méfie-toi du FOMO', detail: 'Une crypto qui a déjà fait +100 % en une semaine n’est pas une opportunité, c’est un risque.' },
  { title: 'Inverse, toujours inverser', detail: 'Demande-toi comment ton investissement pourrait échouer avant de te demander combien il peut rapporter (Munger).' },
  { title: 'Pense à la fiscalité', detail: 'En France, chaque conversion en euros est imposable au-delà de 305 €/an. Garde un historique propre.' },
];

export const BUY_CHECKLIST: { q: string; help: string; critical?: boolean }[] = [
  { q: 'Je comprends ce que fait le projet et comment il crée de la valeur', help: 'Utilité réelle, utilisateurs, revenus — pas seulement une narrative.', critical: true },
  { q: 'J’ai vérifié la tokenomics (offre en circulation, FDV, déblocages à venir)', help: 'Un FDV très supérieur à la capitalisation = pression vendeuse future.', critical: true },
  { q: 'La liquidité est suffisante pour sortir sans casser le prix', help: 'Volume quotidien et liquidité des pools au moins 50× ta position.' },
  { q: 'Le contrat a été vérifié (pas de honeypot, pas de mint illimité)', help: 'Utilise le scan sécurité de Boussole pour les tokens on-chain.', critical: true },
  { q: 'Je respecte ma taille de position maximale', help: 'Selon ton profil : limite par pépite et par altcoin.', critical: true },
  { q: 'J’ai écrit ma thèse en 5 phrases et mes conditions de sortie', help: 'Objectifs de profits ET niveau d’invalidation.' },
  { q: 'Je n’achète pas sous l’effet du FOMO (pas +50 % en 7 jours)', help: 'Si c’est le cas, attends un repli ou passe ton tour.' },
  { q: 'J’ai lu au moins une analyse critique (bear case)', help: 'Cherche activement les arguments contre ton achat.' },
  { q: 'Je peux supporter -70 % sur cette ligne sans paniquer', help: 'Les altcoins chutent régulièrement de 70 à 90 % en marché baissier.' },
  { q: 'L’argent investi n’est pas nécessaire à court terme', help: 'Jamais l’épargne de précaution ni d’argent emprunté.', critical: true },
];
