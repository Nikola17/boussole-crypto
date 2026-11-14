// Composants d'interface réutilisables — barrel : chaque famille vit dans src/components/uikit/,
// ce fichier ré-exporte tout pour que les imports d'appelants (({ Badge, Button, Card… } from '…/ui')
// restent inchangés à travers l'application.

export * from './uikit/base';
export * from './uikit/buttons';
export * from './uikit/badges';
export * from './uikit/charts';
export * from './uikit/inputs';
export * from './uikit/feedback';
export * from './uikit/tables';
