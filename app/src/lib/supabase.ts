import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Apenas a URL e a chave ANÔNIMA (pública por desenho; a segurança vem das políticas RLS).
// A chave service_role NUNCA deve entrar no app.
// No celular (Expo) vem do .env; no navegador, da configuração colada uma vez e guardada no aparelho.
const CFG_KEY = 'mmi-config';
function webConfig(): { url: string; key: string } | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try { const v = localStorage.getItem(CFG_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function saveWebConfig(url: string, key: string) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim().replace(/\/$/, ''), key: key.trim() }));
  location.reload();
}
export function clearWebConfig() { localStorage.removeItem(CFG_KEY); location.reload(); }
const cfg = webConfig();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || cfg?.url || '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || cfg?.key || '';

export const isConfigured = Boolean(url && anon);

export const supabase = createClient(url || 'http://localhost:54321', anon || 'anon-placeholder', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export function isNetworkError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return /network request failed|failed to fetch|network error|timeout|offline/i.test(m);
}

/** Mensagens de erro em português, sem expor detalhes técnicos. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const m = String((e as { message?: string })?.message ?? '');
  if (isNetworkError(e)) return 'Sem conexão. Tente novamente quando estiver online.';
  if (code === '23505') return 'Este registro já existe.';
  if (code === '42501' || /row-level security/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Este e-mail já está cadastrado.';
  if (/convite/i.test(m)) return 'Convite inválido ou expirado.';
  return 'Não foi possível concluir. Tente novamente.';
}
