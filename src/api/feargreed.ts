// Indice Fear & Greed (alternative.me) — historique depuis février 2018.

import { getJson } from './http';

export interface FngPoint {
  value: number;
  label: string;
  time: number; // secondes
}

const LABELS: Record<string, string> = {
  'Extreme Fear': 'Peur extrême',
  Fear: 'Peur',
  Neutral: 'Neutre',
  Greed: 'Avidité',
  'Extreme Greed': 'Avidité extrême',
};

export async function getFearGreed(limit = 60): Promise<FngPoint[]> {
  const r = await getJson<{ data: { value: string; value_classification: string; timestamp: string }[] }>(
    `https://api.alternative.me/fng/?limit=${limit}&format=json`,
  );
  return r.data
    .map((d) => ({ value: Number(d.value), label: LABELS[d.value_classification] ?? d.value_classification, time: Number(d.timestamp) }))
    .sort((a, b) => a.time - b.time);
}

export function fngLabel(v: number): string {
  if (v <= 24) return 'Peur extrême';
  if (v <= 44) return 'Peur';
  if (v <= 55) return 'Neutre';
  if (v <= 75) return 'Avidité';
  return 'Avidité extrême';
}
