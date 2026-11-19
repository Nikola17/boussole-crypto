// Plugins natifs « maison » de Boussole (enregistrés dans MainActivity côté Android).
//
// Depuis Capacitor 6+, window.Capacitor.Plugins n'est PLUS rempli automatiquement pour les plugins
// natifs : il faut un proxy registerPlugin() (les plugins natifs n'apparaissent que dans PluginHeaders).
// Sans ce proxy, la mise à jour embarquée, le keystore, le verrou et le widget Android sont invisibles
// depuis le web — c'était le bug « la mise à jour depuis l'app ne marche pas ».

import { registerPlugin } from '@capacitor/core';

export interface BoussoleUpdateApi {
  downloadAndInstall(a: { url: string }): Promise<{ ok: boolean; reason?: string }>;
}
export interface BoussoleKeychainApi {
  sealSecret(a: { value: string }): Promise<{ blob: string }>;
  openSecret(a: { blob: string }): Promise<{ value: string }>;
}
export interface BoussoleLockApi {
  available(): Promise<{ available: boolean }>;
  authenticate(): Promise<{ ok: boolean; reason?: string }>;
}
export interface BoussoleWidgetApi {
  updateState(s: unknown): Promise<void>;
}

export const BoussoleUpdate = registerPlugin<BoussoleUpdateApi>('BoussoleUpdate');
export const BoussoleKeychain = registerPlugin<BoussoleKeychainApi>('BoussoleKeychain');
export const BoussoleLock = registerPlugin<BoussoleLockApi>('BoussoleLock');
export const BoussoleWidget = registerPlugin<BoussoleWidgetApi>('BoussoleWidget');

/** Ancien accès (Capacitor ≤ 5) : window.Capacitor.Plugins[name], encore présent dans les vieux APK. */
export function legacyPlugin<T>(name: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: { Plugins?: Record<string, T | undefined> } }).Capacitor?.Plugins?.[name];
}
