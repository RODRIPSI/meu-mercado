export interface PurchaseLine { storeId: string | null; categoryId: string | null; totalCents: number }
export interface PurchaseSummary { purchasedAt: string; totalCents: number; budgetCents?: number | null; lines?: PurchaseLine[] }

/** Gasto efetivamente pago por mês (YYYY-MM). Economia estimada NÃO entra aqui. */
export function paidByMonth(purchases: PurchaseSummary[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of purchases) {
    const k = p.purchasedAt.slice(0, 7);
    out[k] = (out[k] ?? 0) + p.totalCents;
  }
  return out;
}

export function sumBy<T extends string | null>(lines: { key: T; totalCents: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.key ?? 'sem-categoria'] = (out[l.key ?? 'sem-categoria'] ?? 0) + l.totalCents;
  return out;
}

export function budgetStatus(spentCents: number, budgetCents: number | null | undefined) {
  if (!budgetCents) return { known: false as const };
  return { known: true as const, remainingCents: budgetCents - spentCents, usedPct: Math.round((spentCents / budgetCents) * 100), over: spentCents > budgetCents };
}

export function monthDelta(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
