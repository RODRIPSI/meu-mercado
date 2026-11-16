import type { PriceRecord, Product, Store, Unit } from './types';
import { packsNeeded } from './units';
import { priceStatus, totalCents } from './pricing';

export type Mode = 'A' | 'B' | 'C';

export interface DemandItem {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
  /** produtos aceitáveis (o escolhido + equivalentes permitidos). Vazio => item sem produto do catálogo. */
  acceptable: string[];
}

export interface OptimizerInput {
  mode: Mode;
  items: DemandItem[];
  products: Map<string, Product>;
  stores: Store[];                 // somente os mercados selecionados
  prices: PriceRecord[];
  now?: Date;
  /** custo de deslocamento por km rodado, em centavos (ida e volta é calculada aqui). */
  costPerKmCents?: number;
  /** incômodo fixo por parada adicional além da primeira, em centavos (modo B usa 300 por padrão). */
  extraStopCents?: number;
  /** máximo de paradas; A=1, B=2 fixos; C usa este valor (padrão = nº de mercados). */
  maxStops?: number;
  /** descarta preços sem verificação há mais de N dias (padrão: usa, mas sinaliza). */
  maxPriceAgeDays?: number | null;
}

export interface Pick {
  itemId: string;
  storeId: string;
  productId: string;
  packs: number;
  totalCents: number;
  priceId: string;
  stale: boolean;
  demo: boolean;
  conditions?: string | null;
}

export interface Plan {
  storeIds: string[];
  picks: Pick[];
  missing: { itemId: string; name: string; reason: string }[];
  itemsCents: number;
  travelCents: number | null;      // null => nenhuma distância conhecida
  totalCents: number;              // itens + deslocamento + paradas extras
  partial: boolean;
  staleUsed: number;
  demoUsed: boolean;
  unknownDistanceStores: string[];
}

export interface OptimizerResult {
  mode: Mode;
  best: Plan | null;
  /** ranking dos planos considerados (melhor primeiro), útil para o modo A (lista de mercados). */
  ranking: Plan[];
  /** base do cálculo para exibir ao usuário. */
  basis: {
    itemsConsidered: number;
    storesConsidered: number;
    priceAssumptions: string[];
    bestSingleCompleteCents: number | null;
    averageSingleCompleteCents: number | null;
    savingsVsAverageCents: number | null;
    savingsVsBestSingleCents: number | null;
  };
}

interface Cell { pick: Pick }

const DEFAULTS = { costPerKmCents: 0, extraStopB: 300 };

function usablePrice(p: PriceRecord, now: Date, maxAge: number | null | undefined): boolean {
  const st = priceStatus(p, now);
  if (st === 'unavailable' || st === 'expired') return false;
  if (maxAge != null && st === 'stale') {
    return (now.getTime() - new Date(p.observedAt).getTime()) / 86_400_000 <= maxAge;
  }
  return true;
}

export function optimize(input: OptimizerInput): OptimizerResult {
  const now = input.now ?? new Date();
  const stores = input.stores;
  const costPerKm = input.costPerKmCents ?? DEFAULTS.costPerKmCents;
  const maxStops = input.mode === 'A' ? 1 : input.mode === 'B' ? 2 : Math.max(1, input.maxStops ?? stores.length);
  const extraStop = input.extraStopCents ?? (input.mode === 'B' ? DEFAULTS.extraStopB : 0);

  const pricesByKey = new Map<string, PriceRecord[]>();
  for (const p of input.prices) {
    if (!usablePrice(p, now, input.maxPriceAgeDays)) continue;
    const k = `${p.storeId}|${p.productId}`;
    (pricesByKey.get(k) ?? pricesByKey.set(k, []).get(k)!).push(p);
  }

  // melhor opção de cada item em cada mercado
  const cells = new Map<string, Cell | { reason: string }>();
  for (const it of input.items) {
    for (const st of stores) {
      let best: Pick | null = null;
      let reason = it.acceptable.length ? 'sem preço conhecido neste mercado' : 'item sem produto do catálogo';
      for (const pid of it.acceptable) {
        const product = input.products.get(pid);
        if (!product) continue;
        const packs = packsNeeded(it.qty, it.unit, product);
        if (packs === null) { reason = 'unidade da lista incompatível com a embalagem'; continue; }
        for (const pr of pricesByKey.get(`${st.id}|${pid}`) ?? []) {
          const total = totalCents(pr, packs);
          if (!best || total < best.totalCents) {
            best = {
              itemId: it.id, storeId: st.id, productId: pid, packs, totalCents: total, priceId: pr.id,
              stale: priceStatus(pr, now) === 'stale', demo: pr.source === 'demo', conditions: pr.conditions,
            };
          }
        }
      }
      cells.set(`${it.id}|${st.id}`, best ? { pick: best } : { reason });
    }
  }

  const travelFor = (s: Store): number | null =>
    s.distanceKm == null ? null : Math.round(2 * s.distanceKm * costPerKm);

  function evaluate(subset: Store[]): Plan {
    const picks: Pick[] = [];
    const missing: Plan['missing'] = [];
    for (const it of input.items) {
      let best: Pick | null = null;
      let why = '';
      for (const st of subset) {
        const c = cells.get(`${it.id}|${st.id}`)!;
        if ('pick' in c) { if (!best || c.pick.totalCents < best.totalCents) best = c.pick; }
        else why = c.reason;
      }
      if (best) picks.push(best);
      else missing.push({ itemId: it.id, name: it.name, reason: why || 'sem preço conhecido' });
    }
    // só conta como parada o mercado que realmente recebeu itens
    const used = [...new Set(picks.map((p) => p.storeId))];
    const usedStores = subset.filter((s) => used.includes(s.id));
    const itemsCents = picks.reduce((a, p) => a + p.totalCents, 0);
    const travels = usedStores.map(travelFor);
    const known = travels.filter((t): t is number => t !== null);
    const travelCents = known.length ? known.reduce((a, b) => a + b, 0) : null;
    const extra = Math.max(0, usedStores.length - 1) * extraStop;
    return {
      storeIds: usedStores.map((s) => s.id),
      picks, missing, itemsCents, travelCents,
      totalCents: itemsCents + (travelCents ?? 0) + extra,
      partial: missing.length > 0,
      staleUsed: picks.filter((p) => p.stale).length,
      demoUsed: picks.some((p) => p.demo),
      unknownDistanceStores: usedStores.filter((s) => s.distanceKm == null).map((s) => s.id),
    };
  }

  // enumera subconjuntos com até maxStops mercados (≤ 7 redes => ≤ 127 combinações)
  const plans: Plan[] = [];
  const n = stores.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = stores.filter((_, i) => mask & (1 << i));
    if (subset.length > maxStops) continue;
    plans.push(evaluate(subset));
  }
  // remove planos idênticos (mesmos mercados efetivamente usados e mesmos itens)
  const seen = new Set<string>();
  const unique = plans.filter((p) => {
    const key = [...p.storeIds].sort().join(',') + '|' + p.picks.map((x) => x.itemId + x.storeId + x.productId).sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // cobertura primeiro, depois menor custo total, depois menos paradas
  unique.sort((a, b) => a.missing.length - b.missing.length || a.totalCents - b.totalCents || a.storeIds.length - b.storeIds.length);

  const single = unique.filter((p) => p.storeIds.length === 1 && !p.partial);
  const bestSingle = single.length ? Math.min(...single.map((p) => p.totalCents)) : null;
  const avgSingle = single.length >= 2 ? Math.round(single.reduce((a, p) => a + p.totalCents, 0) / single.length) : null;
  const best = unique[0] && unique[0].picks.length > 0 ? unique[0] : null;

  const assumptions: string[] = [];
  if (best?.partial) assumptions.push(`Comparação parcial: ${best.missing.length} item(ns) sem preço conhecido nos mercados selecionados.`);
  if (best?.staleUsed) assumptions.push(`${best.staleUsed} preço(s) usado(s) estão desatualizados e podem ter mudado.`);
  if (best?.demoUsed) assumptions.push('Há preços de DEMONSTRAÇÃO neste cálculo; não representam ofertas reais.');
  if (best?.unknownDistanceStores.length) assumptions.push('Distância desconhecida para algum mercado: deslocamento não foi contabilizado.');
  if (best && costPerKm === 0) assumptions.push('Custo de deslocamento por km não informado (considerado R$ 0).');
  if (extraStop > 0) assumptions.push(`Cada parada extra penaliza o cálculo em ${(extraStop / 100).toFixed(2).replace('.', ',')} R$.`);
  assumptions.push('Ofertas vencidas e produtos indisponíveis foram desconsiderados.');

  return {
    mode: input.mode,
    best,
    ranking: unique.slice(0, 10),
    basis: {
      itemsConsidered: input.items.length,
      storesConsidered: stores.length,
      priceAssumptions: assumptions,
      bestSingleCompleteCents: bestSingle,
      averageSingleCompleteCents: avgSingle,
      savingsVsAverageCents: best && !best.partial && avgSingle !== null ? Math.max(0, avgSingle - best.totalCents) : null,
      savingsVsBestSingleCents: best && !best.partial && bestSingle !== null ? Math.max(0, bestSingle - best.totalCents) : null,
    },
  };
}
