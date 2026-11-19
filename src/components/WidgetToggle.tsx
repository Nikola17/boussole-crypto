// Bascule du widget Windows (fenêtre compacte toujours au-dessus) depuis les réglages.

import { useEffect, useState } from 'react';
import { Toggle } from './ui';
import { isElectron } from '../lib/platform';
import { useT } from '../hooks/useT';

declare global {
  interface Window {
    boussoleDesktop?: {
      toggleWidget?: () => Promise<boolean>;
      onWidgetState?: (cb: (open: boolean) => void) => () => void;
    };
  }
}

export function WidgetToggle() {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isElectron || !window.boussoleDesktop?.onWidgetState) return;
    return window.boussoleDesktop.onWidgetState((o) => setOpen(o));
  }, []);
  if (!isElectron || !window.boussoleDesktop?.toggleWidget) return null;
  return (
    <Toggle
      checked={open}
      onChange={async () => setOpen(await window.boussoleDesktop!.toggleWidget!())}
      label={t('Widget Windows')}
      hint={t('Afficher le widget (prix BTC + Fear & Greed + alertes) toujours au-dessus des autres fenêtres')}
    />
  );
}
