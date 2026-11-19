# Build iOS (sur un Mac uniquement)

Le projet Capacitor iOS (`ios/`) est versionné, mais Xcode et CocoaPods n'existent que sur macOS :
**le build iOS se fait sur un Mac**, comme la signature Android se fait sur le PC Windows.

## Prérequis (Mac)

- Xcode (App Store) + Command Line Tools (`xcode-select --install`)
- CocoaPods (`sudo gem install cocoapods`)
- Un compte Apple Developer (payant, 99 $/an) pour signer et publier sur l'App Store

## Build

```bash
git clone <repo> && cd boussole-crypto
npm install
npm run build:ios        # vite build + cap sync ios
npx cap open ios         # ouvre Xcode
cd ios/App && pod install
```

Dans Xcode : sélectionner l'équipe Apple Developer (Signing), choisir la cible, puis
**Product → Archive** pour produire l'IPA de publication.

## Icônes

Les icônes iOS prêtes à l'emploi sont dans `branding/ios/` (clair, sombre, teinté) — à copier dans
`ios/App/App/App.xcassets/AppIcon.appiconset/` (les PNG générés sont ignorés par git, voir `.gitignore`).
Le mode d'emploi général est dans `branding/README.md`.

## Ce qui marche déjà sans Mac

- Toute la logique métier (React) est identique à Android/Windows.
- `allowMixedContent` n'a pas d'équivalent iOS à régler : ATS bloque déjà le HTTP par défaut.
- Pas de build iOS dans la CI GitHub (pas de runner macOS payant utilisé ici).
