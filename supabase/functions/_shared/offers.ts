// Regras PURAS de validação/normalização de ofertas extraídas de encartes.
// Sem imports e sem E/S: roda no Deno (Edge Function) e no Node (testes do app).
// Princípio: o que o modelo de visão devolve é uma HIPÓTESE. Só vira preço "real" se passar nestas regras;
// qualquer dúvida => needs_review (nunca um número chutado).

export type Unit = 'un' | 'kg' | 'g' | 'l' | 'ml';

/** Saída bruta do modelo para um anúncio (valores em reais, como impressos). */
export interface RawOffer {
  name?: string | null;
  brand?: string | null;
  pack_qty?: number | null;
  unit?: string | null;
  price_reais?: number | null;
  unit_price_reais?: number | null;
  unit_price_unit?: string | null;
  promo_min_qty?: number | null;
  promo_unit_price_reais?: number | null;
  loyalty_required?: boolean | null;
  conditions?: string | null;
  valid_from?: string | null;      // AAAA-MM-DD
  valid_until?: string | null;     // AAAA-MM-DD
  store_scope?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;   // normalizado 0..1
  raw_text?: string | null;
  confidence?: number | null;      // 0..1, estimado pelo modelo
}

export interface ValidationContext {
  flyerValidFrom?: string | null;  // validade lida do encarte como um todo
  flyerValidUntil?: string | null;
  today: string;                   // AAAA-MM-DD
}

export interface ValidatedOffer {
  name: string;
  brand: string | null;
  pack_qty: number | null;
  unit: Unit | null;
  price_cents: number | null;
  unit_price_cents: number | null;
  unit_price_unit: Unit | null;
  promo_min_qty: number | null;
  promo_unit_price_cents: number | null;
  loyalty_required: boolean;
  conditions: string | null;
  valid_from: string | null;
  valid_until: string | null;
  store_scope: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
  raw_text: string | null;
  confidence: number | null;
  review_status: 'auto_ok' | 'needs_review';
  issues: string[];                // bloqueantes: mandam para revisão
  warnings: string[];              // informativos: não bloqueiam
}

export const MIN_CONFIDENCE = 0.8;
export const MIN_PRICE_CENTS = 20;          // R$ 0,20
export const MAX_PRICE_CENTS = 200_000;     // R$ 2.000,00 — acima disso, quase certamente erro de leitura
const UNITS: Unit[] = ['un', 'kg', 'g', 'l', 'ml'];
const BASE: Record<Unit, { base: 'un' | 'kg' | 'l'; f: number }> = {
  un: { base: 'un', f: 1 }, kg: { base: 'kg', f: 1 }, g: { base: 'kg', f: 0.001 }, l: { base: 'l', f: 1 }, ml: { base: 'l', f: 0.001 },
};

const isoDate = (s: unknown): string | null =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) ? s : null;

const unitOf = (s: unknown): Unit | null => {
  const v = typeof s === 'string' ? s.trim().toLowerCase().replace('lt', 'l').replace('litro', 'l').replace('unid', 'un').replace('und', 'un') : '';
  return (UNITS as string[]).includes(v) ? (v as Unit) : null;
};

/** Reais (como impresso) -> centavos inteiros; null se ausente/inválido. Nunca devolve 0. */
export function reaisToCents(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  const c = Math.round(v * 100);
  return c > 0 ? c : null;
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Chave estável da oferta; o backend aplica SHA-256 e grava em flyer_offers.fingerprint (UNIQUE). */
export function fingerprintKey(chainId: string, o: Pick<ValidatedOffer, 'name' | 'brand' | 'pack_qty' | 'unit' | 'price_cents' | 'valid_until'>): string {
  return [chainId, normalizeText(o.name), normalizeText(o.brand ?? ''), o.pack_qty ?? '', o.unit ?? '', o.price_cents ?? 'sem-preco', o.valid_until ?? 'sem-validade'].join('|');
}

export function validateOffer(raw: RawOffer, ctx: ValidationContext): ValidatedOffer {
  const issues: string[] = [];
  const warnings: string[] = [];

  const name = (raw.name ?? '').toString().trim();
  if (name.length < 3) issues.push('nome_incompleto');

  const brand = raw.brand?.toString().trim() || null;
  const unit = unitOf(raw.unit);
  const pack = typeof raw.pack_qty === 'number' && raw.pack_qty > 0 ? raw.pack_qty : null;
  if (raw.unit && !unit) warnings.push('unidade_desconhecida');
  if (!pack || !unit) warnings.push('sem_embalagem');
  if (!brand) warnings.push('sem_marca');

  // preço
  let price = reaisToCents(raw.price_reais);
  if (price == null) issues.push('sem_preco');
  else if (price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS) { issues.push('preco_implausivel'); }

  // preço por unidade de medida impresso x calculado
  const upu = unitOf(raw.unit_price_unit);
  let unitPrice = reaisToCents(raw.unit_price_reais);
  if (unitPrice != null && pack && unit && price != null && upu) {
    const a = BASE[unit], b = BASE[upu];
    if (a.base === b.base) {
      const expected = price / (pack * a.f) * b.f;           // centavos por 1 <upu>
      if (Math.abs(expected - unitPrice) / unitPrice > 0.06) issues.push('preco_unitario_incoerente');
    } else warnings.push('unidade_do_preco_unitario_diferente');
  }
  if (unitPrice != null && !upu) { warnings.push('preco_unitario_sem_unidade'); unitPrice = null; }

  // promoção por volume
  let pmq = typeof raw.promo_min_qty === 'number' && raw.promo_min_qty > 1 ? Math.floor(raw.promo_min_qty) : null;
  let pup = reaisToCents(raw.promo_unit_price_reais);
  if ((pmq == null) !== (pup == null)) { issues.push('promocao_incompleta'); pmq = null; pup = null; }
  if (pup != null && price != null && pup >= price) { warnings.push('promocao_sem_desconto'); }

  // validade: a do anúncio; senão a do encarte inteiro (herdada, com aviso)
  let vFrom = isoDate(raw.valid_from);
  let vUntil = isoDate(raw.valid_until);
  if (!vUntil && isoDate(ctx.flyerValidUntil)) { vUntil = isoDate(ctx.flyerValidUntil); vFrom = vFrom ?? isoDate(ctx.flyerValidFrom); warnings.push('validade_herdada_do_encarte'); }
  if (!vUntil) issues.push('sem_validade');
  if (vFrom && vUntil && vUntil < vFrom) issues.push('validade_incoerente');
  if (vUntil && vUntil < ctx.today) issues.push('ja_vencida');

  // confiança do modelo
  const conf = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : null;
  if (conf == null) issues.push('sem_confianca');
  else if (conf < MIN_CONFIDENCE) issues.push('baixa_confianca');

  // posição para auditoria
  const b = raw.bbox;
  const bbox = b && [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number' && n >= 0 && n <= 1) && b.w > 0 && b.h > 0 ? b : null;
  if (!bbox) warnings.push('sem_posicao');

  const blocked = issues.length > 0;
  return {
    name: name || '(ilegível)',
    brand, pack_qty: pack, unit: pack && unit ? unit : null,
    // se algo bloqueante afeta o preço, o preço NÃO é gravado como se fosse real
    price_cents: issues.includes('sem_preco') || issues.includes('preco_implausivel') ? null : price,
    unit_price_cents: unitPrice, unit_price_unit: unitPrice != null ? upu : null,
    promo_min_qty: pmq, promo_unit_price_cents: pup,
    loyalty_required: raw.loyalty_required === true,
    conditions: raw.conditions?.toString().trim() || null,
    valid_from: vFrom, valid_until: vUntil,
    store_scope: raw.store_scope?.toString().trim() || 'rede',
    bbox, raw_text: raw.raw_text?.toString() ?? null, confidence: conf,
    review_status: blocked ? 'needs_review' : 'auto_ok',
    issues, warnings,
  };
}

/** Lê o intervalo de validade do texto do encarte, ex.: "Promoção válida de 14/11/2026 até 17/11/2026". */
export function parseValidityText(text: string): { from: string; until: string } | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:até|a|ate)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) return null;
  const iso = (d: string, mo: string, y: string) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const from = iso(m[1], m[2], m[3]), until = iso(m[4], m[5], m[6]);
  return isoDate(from) && isoDate(until) && until >= from ? { from, until } : null;
}
