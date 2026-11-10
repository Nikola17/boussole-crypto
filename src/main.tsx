import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { restoreQueryCache, startQueryCachePersistence } from './lib/queryCache';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les nouvelles tentatives sont faites par api/http.ts (une seule couche) : ici, aucune.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

// Les dernières données de marché connues sont remises en place AVANT l'affichage : hors ligne, ou si CoinGecko limite les requêtes,
// l'application montre ces données (avec leur date) au lieu d'un écran vide.
function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary scope="app">
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  startQueryCachePersistence(queryClient);
}

void restoreQueryCache(queryClient).catch(() => 0).then(render);
