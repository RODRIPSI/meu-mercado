export interface Observation { priceCents: number; observedAt: string; isPromo: boolean }

export const MIN_OBSERVATIONS = 5;
export const MIN_SPAN_DAYS = 14;

export type Opportunity = 'boa' | 'regular' | 'alta';

export type HistoryStats =
  | { sufficient: false; count: number; reason: string }
  | {
      sufficient: true; count: number;
      avgCents: number; minCents: number; maxCents: number;
      variationPct: number;           // do primeiro ao último registro
      promoFrequency: number;         // 0..1
      potentialSavingCents: number;   // atual - menor já registrado (>= 0)
      opportunity: Opportunity;
    };

export function historyStats(obs: Observation[]): HistoryStats {
  const sorted = [...obs].sort((a, b) => +new Date(a.observedAt) - +new Date(b.observedAt));
  if (sorted.length < MIN_OBSERVATIONS) {
    return { sufficient: false, count: sorted.length, reason: `São necessários ao menos ${MIN_OBSERVATIONS} registros (há ${sorted.length}).` };
  }
  const span = (+new Date(sorted.at(-1)!.observedAt) - +new Date(sorted[0].observedAt)) / 86_400_000;
  if (span < MIN_SPAN_DAYS) {
    return { sufficient: false, count: sorted.length, reason: `O histórico cobre só ${Math.floor(span)} dia(s); são necessários ${MIN_SPAN_DAYS}.` };
  }
  const prices = sorted.map((o) => o.priceCents);
  const current = prices.at(-1)!;
  const min = Math.min(...prices), max = Math.max(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const rank = prices.filter((p) => p < current).length / prices.length;   // fração de registros mais baratos que o atual
  return {
    sufficient: true, count: prices.length,
    avgCents: avg, minCents: min, maxCents: max,
    variationPct: Math.round(((current - prices[0]) / prices[0]) * 1000) / 10,
    promoFrequency: sorted.filter((o) => o.isPromo).length / sorted.length,
    potentialSavingCents: Math.max(0, current - min),
    opportunity: rank <= 0.25 ? 'boa' : rank <= 0.6 ? 'regular' : 'alta',
  };
}
