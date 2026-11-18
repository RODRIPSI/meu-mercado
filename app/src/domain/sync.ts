// Fila offline de alterações em itens de lista + reconciliação sem perda silenciosa.

export interface NewItem { clientId: string; listId: string; name: string; productId?: string | null; qty: number; unit: string; categoryId?: string | null; notes?: string | null; preferredBrand?: string | null; position?: number | null; sourceText?: string | null }
export type Patch = Partial<{ name: string; qty: number; unit: string; status: 'pending' | 'bought' | 'skipped'; notes: string | null; priority: number; assignee: string | null; preferred_brand: string | null; position: number | null; list_id: string; category_id: string | null }>;

export type Mutation =
  | { kind: 'insert'; item: NewItem; queuedAt: string }
  | { kind: 'update'; itemId: string; baseVersion: number; patch: Patch; queuedAt: string }
  | { kind: 'delete'; itemId: string; baseVersion: number; queuedAt: string };

export type RemoteResult =
  | { ok: true }
  | { ok: false; code: 'conflict' | 'duplicate' | 'notfound' | 'network' | 'error'; message?: string };

export interface Remote {
  insert(item: NewItem): Promise<RemoteResult>;
  update(itemId: string, baseVersion: number, patch: Patch): Promise<RemoteResult>;
  remove(itemId: string, baseVersion: number): Promise<RemoteResult>;
}

export interface Conflict { mutation: Mutation; code: 'conflict' | 'duplicate' | 'notfound' | 'error'; message?: string }

/** Junta edições consecutivas do mesmo item (mantém a versão-base mais antiga). */
export function enqueue(queue: Mutation[], m: Mutation): Mutation[] {
  if (m.kind === 'update') {
    const i = queue.findIndex((q) => q.kind === 'update' && q.itemId === m.itemId);
    if (i >= 0) {
      const prev = queue[i] as Extract<Mutation, { kind: 'update' }>;
      const next = [...queue];
      next[i] = { ...prev, patch: { ...prev.patch, ...m.patch }, queuedAt: m.queuedAt };
      return next;
    }
  }
  if (m.kind === 'delete') {
    // apagar um item que só existe localmente (insert pendente) cancela o insert
    const target = m.itemId;
    const idx = queue.findIndex((q) => q.kind === 'insert' && q.item.clientId === target);
    if (idx >= 0) return queue.filter((_, k) => k !== idx);
    return [...queue.filter((q) => !(q.kind === 'update' && q.itemId === target)), m];
  }
  return [...queue, m];
}

export async function flushQueue(queue: Mutation[], remote: Remote): Promise<{ remaining: Mutation[]; conflicts: Conflict[]; applied: number }> {
  const conflicts: Conflict[] = [];
  let applied = 0;
  for (let i = 0; i < queue.length; i++) {
    const m = queue[i];
    let r: RemoteResult;
    try {
      r = m.kind === 'insert' ? await remote.insert(m.item)
        : m.kind === 'update' ? await remote.update(m.itemId, m.baseVersion, m.patch)
        : await remote.remove(m.itemId, m.baseVersion);
    } catch {
      return { remaining: queue.slice(i), conflicts, applied };   // sem rede: preserva ordem e tenta depois
    }
    if (r.ok) { applied++; continue; }
    if (r.code === 'network') return { remaining: queue.slice(i), conflicts, applied };
    conflicts.push({ mutation: m, code: r.code, message: r.message });  // nunca descarta em silêncio
  }
  return { remaining: [], conflicts, applied };
}

/** Sobrepõe a fila pendente ao estado do servidor para exibição offline (marca o que ainda não sincronizou). */
export interface OverlayItem { id: string; name: string; qty: number; unit: string; status: 'pending' | 'bought' | 'skipped'; version: number; [k: string]: unknown }
export function overlayQueue<T extends OverlayItem>(items: T[], queue: Mutation[], listId: string): (T & { pendingSync?: boolean })[] {
  let out: (T & { pendingSync?: boolean })[] = items.map((i) => ({ ...i }));
  for (const m of queue) {
    if (m.kind === 'insert' && m.item.listId === listId) {
      out.push({ id: m.item.clientId, name: m.item.name, qty: m.item.qty, unit: m.item.unit, status: 'pending', version: 0, pendingSync: true } as unknown as T & { pendingSync?: boolean });
    } else if (m.kind === 'update') {
      out = out.map((i) => (i.id === m.itemId ? { ...i, ...m.patch, pendingSync: true } : i));
    } else if (m.kind === 'delete') {
      out = out.filter((i) => i.id !== m.itemId);
    }
  }
  return out;
}
