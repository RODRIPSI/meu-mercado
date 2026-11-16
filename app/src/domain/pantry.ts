export interface Movement { delta: number; reason: 'purchase' | 'consumption' | 'adjustment' | 'discard'; at: string }

/** Estimativa (sempre rotulada como tal) de dias restantes, a partir do consumo observado. null se não há dados suficientes. */
export function estimateDaysLeft(qty: number, movements: Movement[]): { days: number; isEstimate: true } | null {
  const cons = movements.filter((m) => m.reason === 'consumption' && m.delta < 0)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
  if (cons.length < 2) return null;
  const spanDays = (+new Date(cons.at(-1)!.at) - +new Date(cons[0].at)) / 86_400_000;
  if (spanDays < 7) return null;
  const used = cons.slice(1).reduce((a, m) => a + Math.abs(m.delta), 0); // exclui o 1º: marca o início da janela
  if (used <= 0) return null;
  return { days: Math.floor(qty / (used / spanDays)), isEstimate: true };
}

export function needsRestock(qty: number, minQty: number | null | undefined): boolean {
  return minQty != null && qty <= minQty;
}

export function expiringSoon(expiresOn: string | null | undefined, now = new Date(), withinDays = 7): boolean {
  if (!expiresOn) return false;
  const d = (+new Date(expiresOn + 'T23:59:59') - +now) / 86_400_000;
  return d <= withinDays;
}
