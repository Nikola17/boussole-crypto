// Catalogue des modèles du fournisseur compatible OpenAI (prix, contexte) — public sur Nous Portal.

import { useQuery } from '@tanstack/react-query';
import { listCompatModels, type CompatModel } from '../ai/openai';

export function useCompatModels(baseUrl: string, apiKey?: string) {
  return useQuery({
    queryKey: ['compat-models', baseUrl],
    queryFn: () => listCompatModels(baseUrl, apiKey),
    enabled: /^https?:\/\//i.test(baseUrl),
    staleTime: 60 * 60_000,
    retry: 0,
  });
}

export function findModel(models: CompatModel[] | undefined, id: string): CompatModel | undefined {
  return models?.find((m) => m.id === id);
}
