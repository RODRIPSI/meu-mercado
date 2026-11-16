export interface PriceChange { productId: string; storeId: string; oldCents: number | null; newCents: number; isPromo: boolean; validUntil?: string | null; observedAt: string }
export interface Rule { id: string; type: 'price_drop' | 'favorite_promo' | 'below_threshold' | 'offer_expiring'; productId?: string | null; thresholdCents?: number | null; quietStart?: number | null; quietEnd?: number | null; enabled: boolean }

export function inQuietHours(hour: number, start?: number | null, end?: number | null): boolean {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Decide quais alertas disparar. O dedupKey impede repetição do mesmo fato (índice único no banco). */
export function evaluateAlerts(change: PriceChange, rules: Rule[], favorites: Set<string>, now = new Date(), alreadySent = new Set<string>()) {
  const out: { ruleId: string; dedupKey: string; kind: Rule['type'] }[] = [];
  for (const r of rules) {
    if (!r.enabled || (r.productId && r.productId !== change.productId)) continue;
    if (inQuietHours(now.getHours(), r.quietStart, r.quietEnd)) continue;
    let hit = false;
    if (r.type === 'price_drop') hit = change.oldCents != null && change.newCents < change.oldCents;
    if (r.type === 'favorite_promo') hit = change.isPromo && favorites.has(change.productId);
    if (r.type === 'below_threshold') hit = r.thresholdCents != null && change.newCents <= r.thresholdCents;
    if (r.type === 'offer_expiring') hit = !!change.validUntil && (+new Date(change.validUntil) - +now) / 86_400_000 <= 2 && +new Date(change.validUntil) > +now;
    if (!hit) continue;
    const dedupKey = `${r.type}:${change.productId}:${change.storeId}:${change.newCents}`;
    if (alreadySent.has(`${r.id}|${dedupKey}`)) continue;
    out.push({ ruleId: r.id, dedupKey, kind: r.type });
  }
  return out;
}
