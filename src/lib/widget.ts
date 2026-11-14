// Widget Android d'écran d'accueil : le Cockpit pousse « température du marché + valeur du portefeuille »
// au widget posé sur l'écran d'accueil à chaque relevé (au pire toutes les 30 minutes par le système).
// Aucune donnée de plus que ce que l'application affiche déjà : rien de privé n'y part.

import { Capacitor } from '@capacitor/core';

export interface WidgetState {
  temperature: number | null;
  zone: string | null;
  /** Valeur du portefeuille, dans la devise de l'utilisateur. */
  value: number | null;
  currency: 'EUR' | 'USD' | null;
  updatedAt: string;
}

export function widgetAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BoussoleWidget');
  } catch {
    return false;
  }
}

/** Pousse l'état au widget (silencieux : un widget indisponible ne casse jamais l'application). */
export async function pushWidgetState(state: WidgetState): Promise<void> {
  if (!widgetAvailable()) return;
  try {
    const plugin = (Capacitor as unknown as { Plugins?: { BoussoleWidget?: { updateState?: (s: unknown) => Promise<void> } } }).Plugins?.BoussoleWidget;
    await plugin?.updateState?.(state);
  } catch {
    // Le widget est un confort : jamais une erreur à l'écran pour lui.
  }
}
