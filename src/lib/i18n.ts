// Internationalisation légère : la source de vérité reste le texte français (clé = chaîne FR),
// le dictionnaire anglais traduit ; toute clé manquante retombe sur le français.
// Le dépôt est public : ce fichier ne contient aucun secret.

export type Locale = 'fr' | 'en';
export type LocaleSetting = 'auto' | Locale;

/** Détecte la langue de l'appareil (auto) : français si le navigateur est en français, anglais sinon. */
export function resolveLocale(setting: LocaleSetting, navigatorLanguage: string): Locale {
  if (setting === 'auto') return navigatorLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return setting;
}

/** Dictionnaire anglais. Clé = texte français exact utilisé dans le code via t('...'). */
export const en: Record<string, string> = {
  // Navigation
  'Cockpit': 'Dashboard',
  'Signaux': 'Signals',
  'DCA': 'DCA',
  'Wallet': 'Wallet',
  'Labo': 'Lab',
  'Pépites': 'Gems',
  'Trading': 'Trading',
  'Copilote IA': 'AI Copilot',
  'Plus': 'More',
  'Copilote crypto': 'Crypto copilot',
  'Navigation principale': 'Main navigation',
  'Ouvrir le menu': 'Open menu',
  'Fermer le menu': 'Close menu',

  // Commun
  'Enregistrer': 'Save',
  'Annuler': 'Cancel',
  'Supprimer': 'Delete',
  'Modifier': 'Edit',
  'Ajouter': 'Add',
  'Fermer': 'Close',
  'Retour': 'Back',
  'Actualiser': 'Refresh',
  'Copier': 'Copy',
  'Copié': 'Copied',
  'Réessayer': 'Retry',
  'OK': 'OK',
  'Oui': 'Yes',
  'Non': 'No',
  'Aujourd’hui': 'Today',
  'Cette semaine': 'This week',
  'Ce mois': 'This month',
  'Tout': 'All',
  'Rechercher…': 'Search…',
  'Aucun résultat': 'No results',
  'Chargement…': 'Loading…',
  'Enregistrer les modifications': 'Save changes',
  'Réglages': 'Settings',
  'Général': 'General',
  'Langue': 'Language',
  'Automatique (appareil)': 'Automatic (device)',
  'Français': 'French',
  'English': 'English',
  'Devise': 'Currency',
  'Thème': 'Theme',
  'Système': 'System',
  'Sombre': 'Dark',
  'Clair': 'Light',
  'Appliquer': 'Apply',

  // Dashboard (Cockpit)
  'Tableau de bord': 'Dashboard',
  'Valeur totale': 'Total value',
  'P&L du jour': 'Daily P&L',
  'P&L total': 'Total P&L',
  'vs Bitcoin': 'vs Bitcoin',
  'Température du marché': 'Market temperature',
  'Fear & Greed': 'Fear & Greed',
  'Alertes': 'Alerts',
  'Échéances du jour': 'Today’s deadlines',
  'Prochaine échéance': 'Next deadline',
  'Aucune échéance aujourd’hui': 'Nothing due today',
  'Portefeuille': 'Portfolio',
  'Journal': 'Journal',
  'Carnet d’ordres': 'Order book',
  'Voir tout': 'See all',
  'Ouvrir': 'Open',

  // Page Réglages (sections)
  'Compte & plateformes': 'Accounts & platforms',
  'Préférences': 'Preferences',
  'Sécurité': 'Security',
  'Synchronisation': 'Sync',
  'Mises à jour': 'Updates',
  'Sauvegarde & export': 'Backup & export',
  'Notifications': 'Notifications',
  'À propos': 'About',
  'Version': 'Version',
  'Widget Windows': 'Windows widget',
  'Afficher le widget (prix BTC + Fear & Greed + alertes) toujours au-dessus des autres fenêtres': 'Show the widget (BTC price + Fear & Greed + alerts) always on top',
  'Widget affiché': 'Widget shown',
  'Widget masqué': 'Widget hidden',

  // Widget
  'Boussole — widget': 'Boussole — widget',
  'alertes armées': 'armed alerts',
  'Aucune alerte': 'No alerts',
  'Panier': 'Basket',
  'Menu': 'Menu',
  'IA connectée': 'AI connected',
  'IA non configurée': 'AI not configured',
  'Données & affichage': 'Data & display',

  // Dashboard
  'Que faire aujourd’hui ?': 'What to do today?',
  'Selon tes règles, ton DCA et le cycle du marché': 'Based on your rules, your DCA and the market cycle',
  'Mon portefeuille': 'My portfolio',
  'Plus-value latente': 'Unrealized P&L',
  'Dominance Bitcoin': 'Bitcoin dominance',
  'Saison des altcoins': 'Altcoin season',
  'Brief IA du jour': 'AI brief of the day',
  'Le brief n’a pas pu être généré': 'The brief could not be generated',
  'Signaux de mes cryptos': 'My crypto signals',
  'Watchlist, positions et plans DCA': 'Watchlist, positions and DCA plans',
  'Tous les signaux': 'All signals',
  'Tout lire': 'Read all',
};

/** Traduit une clé (texte FR) dans la locale ; variables {nom} remplacées. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = locale === 'en' ? (en[key] ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
