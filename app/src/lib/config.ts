// Configuração do Supabase no navegador: colada uma vez pelo usuário e guardada neste aparelho.
export interface WebConfig { url: string; key: string }

/** Lê o papel (role) de uma chave JWT do Supabase sem validar assinatura. null se não for um JWT legível. */
export function jwtRole(key: string): string | null {
  try {
    const part = key.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch { return null; }
}

export function validateConfig(url: string, key: string): string | null {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url.trim())) return 'A URL deve ser do tipo https://xxxx.supabase.co';
  const role = jwtRole(key.trim());
  if (role === 'service_role') return 'Essa é a chave SECRETA (service_role). Nunca a use no app. Copie a chave "anon public".';
  if (role !== 'anon') return 'Chave inválida. Copie a chave "anon public" em Project Settings → API.';
  return null;
}
