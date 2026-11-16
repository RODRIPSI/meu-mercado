import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PriceRecord, Product, Store } from '@/domain/types';
import type { Equivalence } from '@/domain/compare';
import { supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import { mapPrice, mapProduct, mapStore } from '@/lib/mappers';
import { useHouse } from './house';

export interface Category { id: string; name: string }
export interface Chain { id: string; name: string }
export interface Prefs { favorite: boolean; brandLocked: boolean }
interface Snapshot {
  categories: Category[]; chains: Chain[]; stores: Store[]; storeRows: any[]; products: Product[]; prices: PriceRecord[];
  equivalences: Equivalence[]; prefs: Record<string, Prefs>; barcodes: Record<string, string>; syncedAt: string | null;
}
const empty: Snapshot = { categories: [], chains: [], stores: [], storeRows: [], products: [], prices: [], equivalences: [], prefs: {}, barcodes: {}, syncedAt: null };

interface CatalogCtx extends Snapshot {
  loading: boolean; offline: boolean; reload: () => Promise<void>;
  productMap: Map<string, Product>; storeMap: Map<string, Store>;
}
const Ctx = createContext<CatalogCtx>(null as never);

/** Catálogo da casa (mercados, produtos, preços…) com cache local e atualização em tempo real. */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { house } = useHouse();
  const [snap, setSnap] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const houseId = house?.id;

  const reload = useCallback(async () => {
    if (!houseId) return;
    const key = `catalog:${houseId}`;
    try {
      const q = (t: string) => supabase.from(t).select('*').eq('house_id', houseId);
      const [cats, chains, stores, products, prices, eq, prefs, bars] = await Promise.all([
        supabase.from('categories').select('id, name').order('sort'),
        supabase.from('chains').select('id, name').order('name'),
        q('stores'), q('products'), q('prices'), q('product_equivalences'), q('house_product_prefs'), q('product_barcodes'),
      ]);
      const failed = [cats, chains, stores, products, prices, eq, prefs, bars].find((r) => r.error);
      if (failed?.error) throw failed.error;
      const chainMap = new Map((chains.data ?? []).map((c: any) => [c.id, c.name]));
      const next: Snapshot = {
        categories: cats.data ?? [], chains: chains.data ?? [],
        storeRows: stores.data ?? [], stores: (stores.data ?? []).map((s: any) => mapStore(s, chainMap)),
        products: (products.data ?? []).map(mapProduct), prices: (prices.data ?? []).map(mapPrice),
        equivalences: (eq.data ?? []).map((e: any) => ({ productId: e.product_id, equivalentId: e.equivalent_id })),
        prefs: Object.fromEntries((prefs.data ?? []).map((p: any) => [p.product_id, { favorite: p.favorite, brandLocked: p.brand_locked }])),
        barcodes: Object.fromEntries((bars.data ?? []).map((b: any) => [b.barcode, b.product_id])),
        syncedAt: new Date().toISOString(),
      };
      setSnap(next); setOffline(false); cacheSet(key, next);
    } catch {
      setSnap(await cacheGet<Snapshot>(key, empty)); setOffline(true);  // offline: dados da última sincronização
    } finally { setLoading(false); }
  }, [houseId]);

  useEffect(() => {
    if (!houseId) return;
    setLoading(true); reload();
    let t: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(t); t = setTimeout(reload, 400); };
    const ch = supabase.channel(`catalog:${houseId}`);
    for (const table of ['prices', 'products', 'stores']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `house_id=eq.${houseId}` }, debounced);
    }
    ch.subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [houseId, reload]);

  const productMap = useMemo(() => new Map(snap.products.map((p) => [p.id, p])), [snap.products]);
  const storeMap = useMemo(() => new Map(snap.stores.map((s) => [s.id, s])), [snap.stores]);
  return <Ctx.Provider value={{ ...snap, loading, offline, reload, productMap, storeMap }}>{children}</Ctx.Provider>;
}
export const useCatalog = () => useContext(Ctx);
