// Hook de traduction : t('Cockpit') → « Dashboard » en anglais, « Cockpit » en français.
// Toute chaîne non traduite retombe sur le français (clé = texte FR).

import { useStore } from '../store/useStore';
import { resolveLocale, translate, type Locale } from '../lib/i18n';

export function useLocale(): Locale {
  return useStore((s) => resolveLocale(s.settings.locale, navigator.language));
}

export function useT() {
  const locale = useLocale();
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
