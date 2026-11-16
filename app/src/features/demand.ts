import type { DemandItem } from '@/domain/optimizer';
import { acceptableProductIds } from '@/domain/compare';
import type { ItemRow } from './listsync';
import type { Equivalence } from '@/domain/compare';

/** Converte itens pendentes da lista em demanda para o otimizador, respeitando equivalências e marca travada. */
export function buildDemand(items: ItemRow[], eq: Equivalence[], prefs: Record<string, { brandLocked: boolean }>): DemandItem[] {
  return items.filter((i) => i.status === 'pending' && !i.id.startsWith('local-')).map((i) => ({
    id: i.id, name: i.name, qty: Number(i.qty), unit: i.unit,
    acceptable: i.product_id ? acceptableProductIds(i.product_id, eq, !!prefs[i.product_id]?.brandLocked) : [],
  }));
}
