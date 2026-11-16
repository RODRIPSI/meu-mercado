export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—'; // ausência nunca vira R$ 0,00
  const v = Math.round(cents) / 100;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "12,90" | "12.90" | "R$ 1.234,56" -> centavos. Retorna null se inválido ou <= 0. */
export function parseBRLToCents(input: string): number | null {
  const s = input.replace(/[^\d.,]/g, '').trim();
  if (!s) return null;
  let norm: string;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  else norm = s;
  const n = Number(norm);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
