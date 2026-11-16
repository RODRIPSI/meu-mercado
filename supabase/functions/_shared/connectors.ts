// Conectores de rede: cada um só sabe ENCONTRAR o arquivo do encarte e a validade impressa na página.
// O resto (download, leitura visual, validação, gravação) é comum e fica no pipeline.
// Para integrar outra rede: criar um conector aqui, registrá-lo em CONNECTORS e só então ligar
// flyer_sources.enabled depois de verificar termos/robots da rede e registrar authorization_note.
import { parseValidityText } from './offers.ts';

export interface DiscoveredFlyer {
  sourceUrl: string;                                  // página onde o encarte foi encontrado
  fileUrl: string;                                    // arquivo (PDF) a baixar
  validity: { from: string; until: string } | null;   // validade impressa na página
}
export interface FlyerConnector {
  id: string;
  /** Recebe o HTML da página pública e devolve onde está o arquivo, ou null se não houver encarte. */
  discover(html: string, pageUrl: string): DiscoveredFlyer | null;
}

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Fábrica para redes que publicam um link direto de download do PDF na página do encarte. */
export function pdfLinkConnector(opts: { id: string; linkPattern: RegExp; fallbackPath?: string }): FlyerConnector {
  return {
    id: opts.id,
    discover(html, pageUrl) {
      const origin = new URL(pageUrl).origin;
      let href: string | null = null;
      for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        if (opts.linkPattern.test(m[1])) { href = m[1]; break; }
      }
      if (!href && opts.fallbackPath) href = opts.fallbackPath;
      if (!href) return null;
      const fileUrl = new URL(href, pageUrl).toString();
      if (new URL(fileUrl).origin !== origin) return null;      // nunca seguir link para outro domínio
      return { sourceUrl: pageUrl, fileUrl, validity: parseValidityText(htmlToText(html)) };
    },
  };
}

// Guanabara: a página /encarte oferece "Baixar encarte" em /encarte/baixe (PDF só de imagens).
export const guanabara = pdfLinkConnector({ id: 'guanabara', linkPattern: /\/encarte\/baixe\/?$/i, fallbackPath: '/encarte/baixe' });

export const CONNECTORS: Record<string, FlyerConnector> = { guanabara };
