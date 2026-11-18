import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useHouse } from './house';

/** Nome de exibição do usuário logado (vazio enquanto carrega). */
export function useAuthName(): string {
  const { userId } = useHouse(); const [n, setN] = useState('');
  useEffect(() => { if (userId) supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle().then(({ data }) => setN(data?.display_name ?? '')); }, [userId]);
  return n;
}
