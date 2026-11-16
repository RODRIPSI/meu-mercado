import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { useHouse } from '@/features/house';
import { useCatalog } from '@/features/catalog';
import { useListItems, type ItemRow } from '@/features/listsync';
import { buildDemand } from '@/features/demand';
import { optimize } from '@/domain/optimizer';
import { acceptableProductIds } from '@/domain/compare';
import { totalCents } from '@/domain/pricing';
import { formatBRL, parseBRLToCents } from '@/domain/money';
import { productLabel } from '@/lib/mappers';
import { friendlyError, supabase } from '@/lib/supabase';

interface Line { qty: string; price: string }

export default function ModoCompra() {
  const { id, storeId: pre } = useLocalSearchParams<{ id: string; storeId?: string }>(); const router = useRouter(); const { colors } = useTheme();
  const { house } = useHouse(); const { stores, storeMap, productMap, prices, equivalences, prefs, reload } = useCatalog();
  const L = useListItems(id, house?.id);
  const [storeId, setStoreId] = useState<string | null>(pre ?? null);
  const [lines, setLines] = useState<Record<string, Line>>({}); const [budget, setBudget] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const edit = house!.canEdit;

  const known = (it: ItemRow) => {
    if (!storeId || !it.product_id) return null;
    const demand = buildDemand([it], equivalences, prefs)[0];
    const r = demand ? optimize({ mode: 'A', items: [demand], products: productMap, stores: [storeMap.get(storeId)!], prices }) : null;
    const p = r?.best?.picks[0]; return p ? { cents: p.totalCents, packs: p.packs, priceId: p.priceId } : null;
  };
  const lineCents = (it: ItemRow): number | null => {
    const l = lines[it.id]; const typed = l?.price ? parseBRLToCents(l.price) : null;   // preço unitário informado na loja
    const qty = l?.qty ? Number(l.qty.replace(',', '.')) : Number(it.qty);
    if (typed) return Math.round(typed * qty);
    const k = known(it); return k ? k.cents : null;
  };

  const bought = L.items.filter((i) => i.status === 'bought');
  const pend = L.items.filter((i) => i.status === 'pending');
  const cart = useMemo(() => bought.reduce((a, i) => a + (lineCents(i) ?? 0), 0), [bought, lines, storeId, prices]);
  const unknown = bought.filter((i) => lineCents(i) === null);
  const budgetCents = parseBRLToCents(budget);
  const over = budgetCents != null && cart > budgetCents;

  const alternatives = (it: ItemRow) => {
    if (!storeId || !it.product_id) return [];
    const ids = acceptableProductIds(it.product_id, equivalences, !!prefs[it.product_id]?.brandLocked).filter((p) => p !== it.product_id);
    return ids.map((pid) => ({ p: productMap.get(pid)!, price: prices.find((x) => x.productId === pid && x.storeId === storeId && x.available) })).filter((x) => x.p);
  };

  const finish = async () => {
    setBusy(true); setErr('');
    try {
      const priced = bought.map((i) => ({ i, line: lines[i.id], total: lineCents(i) })).filter((x) => x.total != null);
      const total = priced.reduce((a, x) => a + x.total!, 0);
      const { data: pu, error } = await supabase.from('purchases').insert({ house_id: house!.id, store_id: storeId, list_id: id, total_cents: total, budget_cents: budgetCents }).select('id').single();
      if (error) throw error;
      const rows = priced.map(({ i, line, total: t }) => {
        const qty = line?.qty ? Number(line.qty.replace(',', '.')) : Number(i.qty);
        return { purchase_id: pu.id, house_id: house!.id, product_id: i.product_id, name: i.name, qty, unit: i.unit, unit_price_cents: Math.max(1, Math.round(t! / qty)) };
      });
      if (rows.length) { const r = await supabase.from('purchase_items').insert(rows); if (r.error) throw r.error; }
      // preço encontrado na loja vira observação confirmada (alimenta comparador e histórico)
      for (const { i, line } of priced) {
        const typed = line?.price ? parseBRLToCents(line.price) : null;
        if (typed && i.product_id && storeId) await supabase.from('prices').upsert({ house_id: house!.id, product_id: i.product_id, store_id: storeId, price_cents: typed, source: 'confirmed', source_ref: 'modo compra', observed_at: new Date().toISOString(), is_promo: false, available: true }, { onConflict: 'house_id,product_id,store_id' });
      }
      await reload();
      router.replace('/financas');
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  if (!storeId) return (
    <Screen>
      <T variant="h2">Em qual mercado você está?</T>
      {stores.length === 0 ? <Notice>Cadastre uma filial na aba Mercados primeiro.</Notice> : null}
      <Row style={{ flexWrap: 'wrap' }}>{stores.map((s) => <Chip key={s.id} label={s.name} onPress={() => setStoreId(s.id)} />)}</Row>
    </Screen>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="h2" style={{ flex: 1 }}>{storeMap.get(storeId)?.name}</T><Button kind="ghost" title="Trocar" onPress={() => setStoreId(null)} />
      </Row>
      <Card style={{ borderColor: over ? colors.danger : colors.border }}>
        <T variant="label">CARRINHO ({bought.length} itens)</T>
        <T variant="title" color={over ? colors.danger : colors.text}>{formatBRL(cart)}</T>
        <Field label="Orçamento desta compra (R$)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="opcional" />
        {budgetCents != null ? <T variant="small">{over ? `Acima do orçamento em ${formatBRL(cart - budgetCents)}` : `Restam ${formatBRL(budgetCents - cart)}`}</T> : null}
        {unknown.length ? <Notice>{unknown.length} item(ns) sem preço (informe o preço) não entram no total.</Notice> : null}
      </Card>
      {[...pend, ...bought].map((it) => {
        const k = known(it); const l = lines[it.id] ?? { qty: '', price: '' }; const isBought = it.status === 'bought'; const alts = open === it.id ? alternatives(it) : [];
        return (
          <Card key={it.id}>
            <Row>
              <Pressable disabled={!edit || it.id.startsWith('local-')} onPress={() => L.update(it, { status: isBought ? 'pending' : 'bought' })} style={{ width: 48, height: 48, justifyContent: 'center' }}>
                <Ionicons name={isBought ? 'checkbox' : 'square-outline'} size={32} color={colors.primary} />
              </Pressable>
              <View style={{ flex: 1 }}><T style={isBought ? { opacity: 0.6 } : undefined}>{it.name} × {Number(it.qty)}</T>
                <T variant="small">{k ? `Preço conhecido aqui: ${formatBRL(k.cents)}` : 'Sem preço conhecido neste mercado'}</T>
                {it.pendingSync ? <Badge text="aguardando sincronizar" tone="warn" /> : null}</View>
              <Button kind="ghost" title={open === it.id ? 'Fechar' : 'Detalhes'} onPress={() => setOpen(open === it.id ? null : it.id)} />
            </Row>
            {open === it.id ? (
              <>
                <Row><Field label="Qtd. comprada" value={l.qty} onChangeText={(t) => setLines({ ...lines, [it.id]: { ...l, qty: t } })} keyboardType="decimal-pad" placeholder={String(Number(it.qty))} style={{ minWidth: 110 }} />
                  <Field label="Preço unitário (R$)" value={l.price} onChangeText={(t) => setLines({ ...lines, [it.id]: { ...l, price: t } })} keyboardType="decimal-pad" style={{ minWidth: 140 }} /></Row>
                {alts.length ? <T variant="label">ALTERNATIVAS</T> : it.product_id ? <T variant="small">Sem alternativas cadastradas.</T> : null}
                {alts.map((a) => <T key={a.p.id}>{productLabel(a.p)} — {a.price ? formatBRL(totalCents(a.price, 1)) : 'sem preço aqui'}</T>)}
              </>
            ) : null}
          </Card>
        );
      })}
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {edit ? <Button title="Finalizar compra" onPress={finish} loading={busy} disabled={!bought.length || cart === 0} /> : null}
    </Screen>
  );
}
