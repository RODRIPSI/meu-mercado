import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { supabase, friendlyError } from '@/lib/supabase';
import { useHouse } from '@/features/house';
import { useCatalog } from '@/features/catalog';
import { bestOffersForList, type Offer } from '@/domain/offers';
import type { ListItem, Unit } from '@/domain/types';
import { formatBRL } from '@/domain/money';
import { fmtDate, mapOffer } from '@/lib/offers';

interface SourceInfo { connector: string; enabled: boolean; last_status: string | null; last_checked_at: string | null }

export default function Ofertas() {
  const { house } = useHouse(); const router = useRouter(); const { products } = useCatalog();
  const [offers, setOffers] = useState<Offer[]>([]); const [items, setItems] = useState<ListItem[]>([]); const [listName, setListName] = useState('');
  const [sources, setSources] = useState<SourceInfo[]>([]); const [curator, setCurator] = useState(false); const [pending, setPending] = useState(0);
  const [loyalty, setLoyalty] = useState(false); const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [o, s, c, l] = await Promise.all([
      supabase.from('active_offers').select('*').order('valid_until'),
      supabase.from('flyer_sources').select('connector, enabled, last_status, last_checked_at'),
      supabase.rpc('is_curator'),
      supabase.from('shopping_lists').select('id, name').eq('house_id', house!.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
    ]);
    if (o.error) { setErr(friendlyError(o.error)); return; }
    setErr(''); setOffers((o.data ?? []).map(mapOffer)); setSources((s.data ?? []) as SourceInfo[]); setCurator(c.data === true);
    const list = l.data?.[0];
    if (list) {
      setListName(list.name);
      const it = await supabase.from('list_items').select('id, product_id, name, qty, unit, status, version').eq('list_id', list.id);
      setItems((it.data ?? []).map((r: any) => ({ id: r.id, productId: r.product_id, name: r.name, qty: Number(r.qty), unit: r.unit as Unit, status: r.status, version: r.version })));
    }
    if (c.data === true) {
      const { count } = await supabase.from('flyer_offers').select('id', { count: 'exact', head: true }).eq('review_status', 'needs_review');
      setPending(count ?? 0);
    }
  }, [house]);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const forList = useMemo(() => bestOffersForList({ items, products, offers, allowLoyalty: loyalty, today }), [items, products, offers, loyalty, today]);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? '';
  const shown = useMemo(() => offers.filter((o) => `${o.name} ${o.brand ?? ''}`.toLowerCase().includes(q.toLowerCase())), [offers, q]);

  const checkNow = async () => {
    setBusy(true); setMsg(''); setErr('');
    const { data, error } = await supabase.functions.invoke('ingest-flyer', { body: { force: true } });
    setBusy(false);
    if (error) setErr('Não foi possível verificar agora. Tente novamente em instantes.'); else setMsg((data?.report ?? []).join(' · ') || 'Verificação concluída.');
    load();
  };

  const src = sources[0];
  return (
    <Screen>
      <Notice tone="warn">Ofertas lidas de encartes por inteligência artificial. Só aparecem as que passaram na validação (preço e validade conhecidos). Confira o preço na prateleira — o encarte vale “enquanto durarem os estoques”.</Notice>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {msg ? <Notice tone="ok">{msg}</Notice> : null}
      {src && !src.enabled ? <Notice>Leitura automática de encartes ainda desligada ({src.connector}). Enquanto isso, nenhuma oferta é importada.</Notice> : null}
      {src?.enabled && src.last_checked_at ? <T variant="small">Última verificação: {new Date(src.last_checked_at).toLocaleString('pt-BR')} · {src.last_status ?? '—'}</T> : null}
      {curator ? (
        <Row>
          <Button title={busy ? 'Verificando…' : 'Verificar agora'} kind="secondary" style={{ flex: 1 }} loading={busy} onPress={checkNow} />
          <Button title={`Revisar (${pending})`} style={{ flex: 1 }} disabled={pending === 0} onPress={() => router.push('/revisar-ofertas')} />
        </Row>
      ) : null}

      <Row><Chip label="Incluir ofertas com cartão da rede" selected={loyalty} onPress={() => setLoyalty(!loyalty)} /></Row>

      {listName ? (
        <>
          <T variant="h2">Para a lista “{listName}”</T>
          {forList.length === 0 ? <T variant="small">Nenhuma oferta vigente encontrada para os itens pendentes.</T> : null}
          {forList.map((m) => (
            <Card key={m.itemId}>
              <T variant="h2">{itemName(m.itemId)}</T>
              <T>{m.offer.name}{m.offer.brand ? ` · ${m.offer.brand}` : ''} {m.offer.packQty}{m.offer.unit}</T>
              <Row style={{ justifyContent: 'space-between' }}>
                <T>{formatBRL(m.totalCents)}{m.packs > 1 ? ` (${m.packs}×)` : ''} · {m.offer.chainName}</T>
                <Row>
                  {m.kind !== 'exata' ? <Badge text={m.kind === 'texto' ? 'confira o produto' : 'outra embalagem'} tone="warn" /> : null}
                  {m.offer.loyaltyRequired ? <Badge text="cartão" tone="accent" /> : null}
                  <Badge text={`até ${fmtDate(m.offer.validUntil)}`} />
                </Row>
              </Row>
              {m.offer.conditions ? <T variant="small">{m.offer.conditions}</T> : null}
            </Card>
          ))}
        </>
      ) : null}

      <T variant="h2">Ofertas vigentes ({offers.length})</T>
      <Field label="Buscar oferta" value={q} onChangeText={setQ} placeholder="Arroz, leite, café…" />
      {offers.length === 0 ? <Empty title="Nenhuma oferta vigente" hint="Quando um encarte for lido e validado, as ofertas aparecem aqui." /> : null}
      {shown.map((o) => (
        <Card key={o.id}>
          <T variant="h2">{o.name}{o.brand ? ` · ${o.brand}` : ''}{o.packQty ? ` ${o.packQty}${o.unit}` : ''}</T>
          <Row style={{ justifyContent: 'space-between' }}>
            <T>{formatBRL(o.priceCents)} · {o.chainName}</T>
            <Row>
              {o.loyaltyRequired ? <Badge text="cartão" tone="accent" /> : null}
              {o.promoMinQty && o.promoUnitPriceCents ? <Badge text={`${o.promoMinQty}+ por ${formatBRL(o.promoUnitPriceCents)}`} tone="ok" /> : null}
              <Badge text={`até ${fmtDate(o.validUntil)}`} />
            </Row>
          </Row>
          {o.conditions ? <T variant="small">{o.conditions}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
