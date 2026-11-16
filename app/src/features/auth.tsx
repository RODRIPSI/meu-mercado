import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

const Ctx = createContext<{ session: Session | null; loading: boolean; recovering: boolean; clearRecovery: () => void }>(null as never);

/** Extrai tokens de um link de recuperação de senha: mmi://nova-senha#access_token=...&refresh_token=...&type=recovery */
export function parseRecoveryUrl(url: string): { access_token: string; refresh_token: string } | null {
  const frag = url.split('#')[1] ?? url.split('?')[1] ?? '';
  const p = new URLSearchParams(frag);
  if (p.get('type') !== 'recovery') return null;
  const a = p.get('access_token'), r = p.get('refresh_token');
  return a && r ? { access_token: a, refresh_token: r } : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    const handle = async (url: string | null) => {
      if (!url) return;
      const t = parseRecoveryUrl(url);
      if (t) { await supabase.auth.setSession(t); setRecovering(true); }
    };
    Linking.getInitialURL().then(handle);
    const l = Linking.addEventListener('url', (e) => handle(e.url));
    return () => { sub.subscription.unsubscribe(); l.remove(); };
  }, []);

  return <Ctx.Provider value={{ session, loading, recovering, clearRecovery: () => setRecovering(false) }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
