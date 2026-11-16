import type { Offer } from '@/domain/offers';
import type { Unit } from '@/domain/types';

export const mapOffer = (r: any): Offer => ({
  id: r.id, chainId: r.chain_id, chainName: r.chain_name ?? '', name: r.name, brand: r.brand,
  packQty: r.pack_qty == null ? null : Number(r.pack_qty), unit: (r.unit ?? null) as Unit | null,
  priceCents: r.price_cents, promoMinQty: r.promo_min_qty, promoUnitPriceCents: r.promo_unit_price_cents,
  loyaltyRequired: !!r.loyalty_required, conditions: r.conditions, validUntil: r.valid_until,
});

export const fmtDate = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—');

/** Motivos de dúvida em português claro (para a tela de revisão). */
export const ISSUE_LABEL: Record<string, string> = {
  nome_incompleto: 'Nome incompleto ou ilegível', sem_preco: 'Preço não encontrado', preco_implausivel: 'Preço fora do esperado',
  preco_unitario_incoerente: 'Preço por kg/L não bate com preço e embalagem', promocao_incompleta: 'Promoção por quantidade incompleta',
  sem_validade: 'Sem data de validade', validade_incoerente: 'Datas de validade incoerentes', ja_vencida: 'Já vencida',
  sem_confianca: 'Leitura sem nível de confiança', baixa_confianca: 'Leitura com baixa confiança',
};
export const issueText = (i: string) => ISSUE_LABEL[i] ?? i;
