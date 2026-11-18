import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { supabase, isNetworkError } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import { enqueue, flushQueue, overlayQueue, type Conflict, type Mutation, type NewItem, type Patch, type Remote, type RemoteResult } from '@/domain/sync';

export interface ItemRow {
  id: string; list_id: string; house_id: string; product_id: string | null; name: string; qty: number; unit: any;
  status: 'pending' | 'bought' | 'skipped'; notes: string | null; priority: number; assignee: string | null;
  preferred_brand: string | null; est_price_cents: number | null; version: number; pendingSync?: boolean;
  category_id: string | null; position: number | null; source_text: string | null; created_at?: string; updated_at?: string;
}

const QKEY = 'queue:v1';
const CKEY = 'conflicts:v1';

function classify(error: any): RemoteResult {
  if (!error) return { ok: true };
  if (isNetworkError(error)) return { ok: false, code: 'network', message: error.message };
  if (error.code === '23505') return { ok: false, code: 'duplicate', message: error.message };
  return { ok: false, code: 'error', message: error.message };
}

export function makeRemote(houseId: string): Remote {
  return {
    async insert(i: NewItem) {
      const { error } = await supabase.from('list_items').insert({ list_id: i.listId, house_id: houseId, name: i.name, product_id: i.productId ?? null, qty: i.qty, unit: i.unit, category_id: i.categoryId ?? null, notes: i.notes ?? null, preferred_brand: i.preferredBrand ?? null, position: i.position ?? null, source_text: i.sourceText ?? null });
      return classify(error);
    },
    async update(id, version, patch: Patch) {
      const { data, error } = await supabase.from('list_items').update(patch).eq('id', id).eq('version', version).select('id');
      if (error) return classify(error);
      return data && data.length ? { ok: true } : { ok: false, code: 'conflict' };   // alguém editou antes
    },
    async remove(id, version) {
      const { data, error } = await supabase.from('list_items').delete().eq('id', id).eq('version', version).select('id');
      if (error) return classify(error);
      return data && data.length ? { ok: true } : { ok: false, code: 'conflict' };
    },
  };
}

/** Itens de uma lista: cache local, tempo real, fila offline e conflitos visíveis. */
export function useListItems(listId: string, houseId: string | undefined) {
  const [server, setServer] = useState<ItemRow[]>([]);
  const [queue, setQueue] = useState<Mutation[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const queueRef = useRef<Mutation[]>([]);
  queueRef.current = queue;

  const persistQueue = (q: Mutation[]) => { setQueue(q); cacheSet(QKEY, q); };

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase.from('list_items').select('*').eq('list_id', listId).order('created_at');
    if (error) { setServer(await cacheGet<ItemRow[]>(`items:${listId}`, [])); return false; }
    setServer(data as ItemRow[]); cacheSet(`items:${listId}`, data); return true;
  }, [listId]);

  const flush = useCallback(async () => {
    if (!houseId || busy.current || !queueRef.current.length) return;
    busy.current = true;
    try {
      const r = await flushQueue(queueRef.current, makeRemote(houseId));
      persistQueue(r.remaining);
      if (r.conflicts.length) {
        const all = [...(await cacheGet<Conflict[]>(CKEY, [])), ...r.conflicts];
        setConflicts(all); cacheSet(CKEY, all);
      }
      await fetchItems();
    } finally { busy.current = false; }
  }, [houseId, fetchItems]);

  useEffect(() => {
    (async () => {
      setQueue(await cacheGet<Mutation[]>(QKEY, [])); setConflicts(await cacheGet<Conflict[]>(CKEY, []));
      await fetchItems(); setLoading(false); flush();
    })();
    const unsubNet = NetInfo.addEventListener((s) => { const on = !!s.isConnected && s.isInternetReachable !== false; setOnline(on); if (on) flush(); });
    let t: ReturnType<typeof setTimeout>;
    const ch = supabase.channel(`items:${listId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` },
      () => { clearTimeout(t); t = setTimeout(fetchItems, 250); }).subscribe();
    return () => { unsubNet(); clearTimeout(t); supabase.removeChannel(ch); };
  }, [listId, fetchItems, flush]);

  const push = useCallback(async (m: Mutation) => { persistQueue(enqueue(queueRef.current, m)); queueRef.current = enqueue(queueRef.current, m); await flush(); }, [flush]);
  const now = () => new Date().toISOString();

  const items = overlayQueue(server as any, queue, listId) as unknown as ItemRow[];
  return {
    items, loading, online, conflicts, pendingCount: queue.length,
    add: (i: Omit<NewItem, 'clientId' | 'listId'>) => push({ kind: 'insert', queuedAt: now(), item: { ...i, listId, clientId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } }),
    update: (it: ItemRow, patch: Patch) => push({ kind: 'update', itemId: it.id, baseVersion: it.version, patch, queuedAt: now() }),
    remove: (it: ItemRow) => push({ kind: 'delete', itemId: it.id, baseVersion: it.version, queuedAt: now() }),
    refresh: fetchItems,
    /** Resolve um conflito: 'mine' reaplica a alteração local sobre a versão atual; 'theirs' descarta a local. */
    async resolveConflict(c: Conflict, choice: 'mine' | 'theirs') {
      const rest = conflicts.filter((x) => x !== c); setConflicts(rest); cacheSet(CKEY, rest);
      if (choice === 'theirs') return;
      await fetchItems();
      const m = c.mutation;
      if (m.kind === 'update') {
        const { data } = await supabase.from('list_items').select('version').eq('id', m.itemId).maybeSingle();
        if (data) await push({ ...m, baseVersion: data.version });
      } else if (m.kind === 'insert') await push(m);
    },
  };
}
