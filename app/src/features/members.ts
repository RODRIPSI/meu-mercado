import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import type { Member } from './house';

/** Integrantes da casa com nome de exibição (cache para uso offline). */
export function useMembers(houseId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!houseId) return;
    (async () => {
      const key = `members:${houseId}`;
      const { data: m, error } = await supabase.from('house_members').select('user_id, role, can_edit').eq('house_id', houseId);
      if (error || !m) { setMembers(await cacheGet<Member[]>(key, [])); return; }
      const { data: p } = await supabase.from('profiles').select('id, display_name').in('id', m.map((x: any) => x.user_id));
      const names = new Map((p ?? []).map((x: any) => [x.id, x.display_name]));
      const list = m.map((x: any) => ({ ...x, display_name: names.get(x.user_id) || 'Integrante' })) as Member[];
      setMembers(list); cacheSet(key, list);
    })();
  }, [houseId]);
  return members;
}
