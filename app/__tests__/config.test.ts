import { describe, it, expect } from 'vitest';
import { jwtRole, validateConfig } from '@/lib/config';
const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;
describe('configuração do Supabase no navegador', () => {
  it('lê o papel da chave', () => { expect(jwtRole(jwt('anon'))).toBe('anon'); expect(jwtRole('lixo')).toBeNull(); });
  it('aceita URL e chave anon', () => { expect(validateConfig('https://abc123.supabase.co', jwt('anon'))).toBeNull(); });
  it('recusa a chave service_role', () => { expect(validateConfig('https://abc123.supabase.co', jwt('service_role'))).toMatch(/SECRETA/); });
  it('recusa URL estranha e chave ilegível', () => {
    expect(validateConfig('http://evil.com', jwt('anon'))).toMatch(/URL/);
    expect(validateConfig('https://abc123.supabase.co', 'abc')).toMatch(/inválida/);
  });
});
