// Organização dos itens de uma lista em três visões. Funções puras (testáveis).
import { categorize, CATEGORY_NAMES } from './listparse';

export interface ViewItem { id: string; name: string; status: 'pending' | 'bought' | 'skipped'; category_id?: string | null; position?: number | null; created_at?: string }
export interface Group<T> { key: string; title: string; items: T[] }

/** Categoria efetiva: a gravada no item; sem ela, sugerida pelo nome (apenas exibição, não grava). */
export function effectiveCategory(it: ViewItem, catName: (id: string) => string | undefined): string {
  return (it.category_id && catName(it.category_id)) || categorize(it.name);
}

const ORDER = ['Mercearia', 'Hortifruti', 'Açougue e peixes', 'Laticínios e frios', 'Limpeza', 'Higiene e beleza'];
const orderIndex = (n: string) => { const i = ORDER.indexOf(n); return i >= 0 ? i : ORDER.length + Math.max(0, CATEGORY_NAMES.indexOf(n as never)); };

export function groupByCategory<T extends ViewItem>(items: T[], catName: (id: string) => string | undefined): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) { const c = effectiveCategory(it, catName); map.set(c, [...(map.get(c) ?? []), it]); }
  return [...map.entries()].sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]) || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([title, its]) => ({ key: title, title, items: its }));
}

/** Por supermercado: usa a estratégia escolhida (picks do otimizador). Sem preço conhecido → grupo próprio, nunca zero. */
export function groupByStore<T extends ViewItem>(items: T[], picks: { itemId: string; storeId: string }[], storeName: (id: string) => string): Group<T>[] {
  const where = new Map(picks.map((p) => [p.itemId, p.storeId]));
  const map = new Map<string, T[]>(); const none: T[] = [];
  for (const it of items) { const s = where.get(it.id); if (s) map.set(s, [...(map.get(s) ?? []), it]); else none.push(it); }
  const out: Group<T>[] = [...map.entries()].map(([sid, its]) => ({ key: sid, title: storeName(sid), items: its })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  if (none.length) out.push({ key: '_none', title: 'Sem preço conhecido', items: none });
  return out;
}

export function sortCustom<T extends ViewItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = a.position, pb = b.position;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
}

/** Troca o item de lugar e devolve as novas posições (renumeradas 1..n) — só o que mudou. */
export function moveItem(ordered: { id: string; position?: number | null }[], id: string, dir: -1 | 1): { id: string; position: number }[] {
  const i = ordered.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= ordered.length) return [];
  const next = [...ordered]; [next[i], next[j]] = [next[j], next[i]];
  return next.map((x, k) => ({ id: x.id, position: k + 1 })).filter((x, k) => ordered[k].id !== x.id || ordered[k].position !== x.position);
}
