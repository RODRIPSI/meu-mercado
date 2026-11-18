import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Notice, ProgressBar, Row, Screen, SectionHeader, StatCard, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useHouse } from '@/features/house';
import { useCatalog } from '@/features/catalog';
import { useAuthName } from '@/features/authname';
import { formatBRL } from '@/domain/money';
import { listStatus, potentialSavings, progress, STATUS_LABEL } from '@/domain/listparse';
import { priceStatus, totalCents } from '@/domain/pricing';
import { packsNeeded } from '@/domain/units';
import { fmtDate, mapOffer } from '@/lib/offers';
import type { Offer } from '@/domain/offers';

interface Src { enabled: boolean; last_status: string | null; last_checked_at: string | null }

export default function Inicio() {
  const router = useRouter(); const { house } = useHouse(); const name = useAuthName();
  const { stores, prices, productMap } = useCatalog();
  const [list, setList] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<any[]>([]); const [offers, setOffers] = useState<Offer[]>([]);
  const [src, setSrc] = useState<Src | null>(null); const [spent, setSpent] = useState<{ cents: number; n: number } | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [l, o, s, p] = await Promise.all([
      supabase.from('shopping_lists').select('id, name').eq('house_id', house!.id).eq('status', 'active').order('updated_at', { ascending: false }).limit(1),
      supabase.from('active_offers').select('*').order('valid_until').limit(40),
      supabase.from('flyer_sources').select('enabled, last_status, last_checked_at').limit(1),
      supabase.from('purchases').select('total_cents').eq('house_id', house!.id).gte('purchased_at', monthStart.toISOString()),
    ]);
    if (l.error) { setOffline(true); return; }
    setOffline(false);
    const cur = l.data?.[0] ?? null; setList(cur);
    if (cur) { const it = await supabase.from('list_items').select('id, name, qty, unit, status, product_id').eq('list_id', cur.id); setItems(it.data ?? []); } else setItems([]);
    setOffers((o.data ?? []).map(mapOffer)); setSrc((s.data?.[0] as Src) ?? null);
    const rows = (p.data ?? []).filter((r: any) => r.total_cents > 0);
    setSpent(rows.length ? { cents: rows.reduce((a: number, r: any) => a + r.total_cents, 0), n: rows.length } : null);
  }, [house]);
  useEffect(() => { load(); }, [load]);

  const prog = progress(items); const status = listStatus(items);
  const activeIds = useMemo(() => new Set(stores.filter((s) => s.active !== false).map((s) => s.id)), [stores]);
  const saving = useMemo(() => {
    const per = items.filter((i) => i.status === 'pending' && i.product_id && productMap.get(i.product_id)).map((i) => {
      const prod = productMap.get(i.product_id)!; const packs = packsNeeded(Number(i.qty), i.unit, prod) ?? 1;
      const byStore = new Map<string, number>();
      for (const pr of prices) {
        if (pr.productId !== prod.id || !activeIds.has(pr.storeId) || pr.source === 'demo' || priceStatus(pr) !== 'current') continue;
        const c = totalCents(pr, packs); byStore.set(pr.storeId, Math.min(c, byStore.get(pr.storeId) ?? Infinity));
      }
      return { qtyPacks: 1, storeCents: [...byStore.values()] };
    });
    return potentialSavings(per);
  }, [items, prices, productMap, activeIds]);

  const recent = offers.slice(0, 3);
  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <T variant="title">Olá{name ? `, ${name.split(' ')[0]}` : ''}</T>
        <T variant="small">{house!.name}</T>
      </View>
      {offline ? <Notice>Sem conexão — algumas informações podem estar desatualizadas.</Notice> : null}

      {list ? (
        <Card onPress={() => router.push(`/lista/${list.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}><T variant="small">LISTA EM ANDAMENTO</T><Badge text={STATUS_LABEL[status]} tone={status === 'concluida' ? 'ok' : status === 'em_andamento' ? 'accent' : 'neutral'} /></Row>
          <T variant="h2">{list.name}</T>
          <ProgressBar pct={prog.pct} />
          <T variant="small">{prog.bought} de {prog.total} itens comprados</T>
        </Card>
      ) : (
        <Card><T variant="h2">Nenhuma lista ativa</T><T variant="small">Crie uma lista ou importe a que você já tem.</T><Button title="Ir para Listas" onPress={() => router.push('/listas')} /></Card>
      )}

      <Row style={{ flexWrap: 'wrap' }}>
        <StatCard label="Economia potencial" value={saving.items ? formatBRL(saving.cents) : '—'} tone={saving.items ? 'accent' : undefined}
          hint={saving.items ? `diferença entre mercados em ${saving.items} item(ns); não é desconto garantido` : 'precisa de ≥2 preços atuais por item'} />
        <StatCard label="Compras no mês" value={spent ? formatBRL(spent.cents) : '—'} hint={spent ? `${spent.n} compra(s) registrada(s)` : 'nenhuma compra registrada'} />
      </Row>

      <Card>
        <T variant="h2">Leitura automática de encartes</T>
        <T variant="small">{!src ? 'Fonte ainda não configurada.' : !src.enabled ? 'Ainda desligada: nenhuma oferta é importada até você autorizar.' : src.last_checked_at ? `Última verificação: ${new Date(src.last_checked_at).toLocaleString('pt-BR')}` : 'Ligada; aguardando a primeira verificação.'}</T>
        <Button kind="secondary" small title="Ver ofertas e comparar" onPress={() => router.push('/ofertas')} />
      </Card>

      <SectionHeader title="Ofertas recentes" action={offers.length ? 'Ver todas' : undefined} onAction={() => router.push('/ofertas')} />
      {recent.length === 0 ? <T variant="small">Nenhuma oferta vigente validada ainda. Quando um encarte for lido e conferido, ele aparece aqui.</T> : recent.map((o) => (
        <Card key={o.id}><T variant="h2">{o.name}{o.brand ? ` · ${o.brand}` : ''}</T><Row style={{ justifyContent: 'space-between' }}><T>{formatBRL(o.priceCents)} · {o.chainName}</T><Badge text={`até ${fmtDate(o.validUntil)}`} /></Row></Card>
      ))}
    </Screen>
  );
}
