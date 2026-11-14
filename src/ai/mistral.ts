// Mistral AI (La Plateforme) : API compatible OpenAI sur https://api.mistral.ai/v1, appelée par le même client
// que Nous Portal (src/ai/openai.ts). Le catalogue est lu EN DIRECT avec ta clé (GET /v1/models) : tous les modèles
// de conversation de ton compte apparaissent, y compris ceux d'autres éditeurs que Mistral propose (DeepSeek, GLM…),
// sans liste figée à tenir à jour. L'API accepte les appels depuis l'application (CORS ouvert, vérifié).

export const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
/** Alias stable : pointe toujours vers la dernière version de Mistral Large. */
export const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';

/** Proposés tant que la liste en direct n'est pas chargée (alias « -latest » : ils suivent les nouvelles versions). */
export const MISTRAL_SUGGESTED: { id: string; label: string; note: string }[] = [
  { id: 'mistral-large-latest', label: 'Mistral Large (dernière version)', note: 'Le plus capable de Mistral : briefs, comité, conseiller.' },
  { id: 'mistral-medium-latest', label: 'Mistral Medium (dernière version)', note: 'Bon compromis qualité / prix.' },
  { id: 'mistral-small-latest', label: 'Mistral Small (dernière version)', note: 'Rapide et économique, pour les analyses courtes.' },
  { id: 'magistral-medium-latest', label: 'Magistral Medium (raisonnement)', note: 'Modèle qui raisonne avant de répondre : plus lent, plus posé.' },
];

export interface MistralModel {
  id: string;
  name: string;
  description: string;
  context: number | null;
  /** Autres identifiants qui désignent le même modèle (ex : « mistral-large-latest »). */
  aliases: string[];
  /** Date de retrait annoncée (ISO), le cas échéant. */
  deprecation: string | null;
  created: number | null;
}

interface RawMistralModel {
  id?: string;
  name?: string | null;
  description?: string | null;
  created?: number;
  max_context_length?: number;
  aliases?: string[];
  deprecation?: string | null;
  capabilities?: { completion_chat?: boolean };
  type?: string;
}

/** Les modèles de conversation de la réponse de /v1/models, alias regroupés, retirés à la fin. Fonction pure, testée. */
export function parseMistralModels(json: unknown): MistralModel[] {
  const data = (json as { data?: RawMistralModel[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const byId = new Map<string, MistralModel>();
  for (const m of data) {
    if (!m?.id || m.capabilities?.completion_chat === false) continue;
    // Un même modèle apparaît sous son nom daté et sous ses alias : on garde une entrée, celle qui porte la liste d'alias.
    const key = [m.id, ...(m.aliases ?? [])].sort()[0];
    const prev = byId.get(key);
    if (prev && prev.aliases.length >= (m.aliases ?? []).length) continue;
    byId.set(key, {
      id: m.id,
      name: m.name || m.id,
      description: m.description ?? '',
      context: m.max_context_length ?? null,
      aliases: m.aliases ?? [],
      deprecation: m.deprecation ?? null,
      created: m.created ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => Number(!!a.deprecation) - Number(!!b.deprecation) || a.id.localeCompare(b.id));
}

export async function listMistralModels(apiKey: string): Promise<MistralModel[]> {
  const res = await fetch(`${MISTRAL_BASE_URL}/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
  if (res.status === 401) throw new Error('Clé Mistral refusée : vérifie-la sur console.mistral.ai.');
  if (!res.ok) throw new Error(`Impossible de charger les modèles Mistral (${res.status}).`);
  return parseMistralModels(await res.json());
}
