import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import { useAuth } from './auth';

export interface HouseInfo { id: string; name: string; role: 'admin' | 'member'; canEdit: boolean }
export interface Member { user_id: string; role: 'admin' | 'member'; can_edit: boolean; display_name: string }

const Ctx = createContext<{
  houses: HouseInfo[]; house: HouseInfo | null; loading: boolean; userId: string | null;
  select: (id: string) => void; refresh: () => Promise<void>;
}>(null as never);

export function HouseProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [houses, setHouses] = useState<HouseInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setHouses([]); setLoading(false); return; }
    const { data, error } = await supabase.from('house_members').select('role, can_edit, houses(id, name)').eq('user_id', userId);
    if (!error && data) {
      const list: HouseInfo[] = data.filter((r: any) => r.houses).map((r: any) => ({ id: r.houses.id, name: r.houses.name, role: r.role, canEdit: r.can_edit }));
      setHouses(list); cacheSet(`houses:${userId}`, list);
    } else {
      setHouses(await cacheGet<HouseInfo[]>(`houses:${userId}`, []));   // offline: último estado conhecido
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { AsyncStorage.getItem('house-id').then((v) => v && setSelected(v)); }, []);
  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  const house = houses.find((h) => h.id === selected) ?? houses[0] ?? null;
  const select = (id: string) => { setSelected(id); AsyncStorage.setItem('house-id', id); };
  return <Ctx.Provider value={{ houses, house, loading, userId, select, refresh }}>{children}</Ctx.Provider>;
}
export const useHouse = () => useContext(Ctx);
