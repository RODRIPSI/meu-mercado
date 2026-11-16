// Arquitetura de conectores de preço — um módulo independente por fonte/mercado.
// IMPORTANTE: nenhum conector automático está implementado. Antes de criar um, valide por escrito:
// (1) disponibilidade técnica, (2) termos de uso/robots, (3) autorização, (4) limites de uso (veja docs/FONTES_DE_PRECO.md).
import type { PriceSource } from '@/domain/types';

export interface RawPriceObservation {
  storeId: string;              // filial específica (nunca a rede inteira)
  productRef: { barcode?: string; name?: string; brand?: string; packQty?: number; unit?: string };
  priceCents: number;           // > 0; fontes sem preço não geram observação
  isPromo: boolean;
  validUntil?: string | null;
  conditions?: string | null;
  observedAt: string;
  sourceRef: string;            // URL do encarte, nome do arquivo, nº da nota...
}

export interface ConnectorInfo {
  id: string;                   // ex.: 'manual', 'csv', 'nfce'
  label: string;
  source: PriceSource;
  automatic: boolean;
  /** Preenchido após a verificação de termos/permissões. Conectores sem isso não podem ser ativados. */
  authorization: { verifiedAt: string; basis: string } | null;
}

export interface PriceConnector {
  info: ConnectorInfo;
  fetch(ctx: { storeId: string; since?: string }): Promise<RawPriceObservation[]>;
}

/** Registro: hoje só existem as fontes manuais (telas "Registrar preço", "Modo compra" e "Importar"). */
export const REGISTERED_CONNECTORS: ConnectorInfo[] = [
  { id: 'manual', label: 'Registro manual', source: 'manual', automatic: false, authorization: { verifiedAt: '2026-11-15', basis: 'entrada do próprio usuário' } },
  { id: 'csv', label: 'Importação de CSV', source: 'imported', automatic: false, authorization: { verifiedAt: '2026-11-15', basis: 'arquivo fornecido pelo usuário' } },
];

export function assertActivatable(c: ConnectorInfo) {
  if (c.automatic && !c.authorization) throw new Error(`Conector "${c.id}" não pode ser ativado sem verificação de termos e autorização.`);
}
