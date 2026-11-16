import React, { useState } from 'react';
import { Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { parseBRLToCents, formatBRL } from '@/domain/money';
import { productLabel } from '@/lib/mappers';

export default function PrecoNovo() {
  const params = useLocalSearchParams<{ productId?: string; storeId?: string }>(); const router = useRouter();
  const { house } = useHouse(); const { products, stores, reload } = useCatalog();
  const [pid, setPid] = useState<string | null>(params.productId ?? null); const [sid, setSid] = useState<string | null>(params.storeId ?? null);
  const [q, setQ] = useState(''); const [price, setPrice] = useState(''); const [confirmed, setConfirmed] = useState(true);
  const [promo, setPromo] = useState(false); const [minQty, setMinQty] = useState(''); const [volPrice, setVolPrice] = useState('');
  const [until, setUntil] = useState(''); const [cond, setCond] = useState(''); const [avail, setAvail] = useState(true); const [err, setErr] = useState('');
  const cents = parseBRLToCents(price);
  const filtered = products.filter((p) => productLabel(p).toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  const volOk = !minQty && !volPrice ? true : Number(minQty) > 1 && parseBRLToCents(volPrice) != null;
  const dateOk = !until || /^\d{4}-\d{2}-\d{2}$/.test(until);

  const save = async () => {
    const { error } = await supabase.from('prices').upsert({
      house_id: house!.id, product_id: pid, store_id: sid, price_cents: cents, source: confirmed ? 'confirmed' : 'manual', observed_at: new Date().toISOString(),
      is_promo: promo, promo_min_qty: minQty ? Number(minQty) : null, promo_unit_price_cents: minQty ? parseBRLToCents(volPrice) : null,
      valid_until: until ? `${until}T23:59:59-03:00` : null, conditions: cond.trim() || null, available: avail,
    }, { onConflict: 'house_id,product_id,store_id' });
    if (error) return setErr(friendlyError(error));
    await reload(); router.back();
  };

  return (
    <Screen>
      <T variant="small">Informe apenas preços que você viu. Se não souber o preço, não registre — ausência nunca vira R$ 0,00.</T>
      {!pid ? (<>
        <Field label="Produto" value={q} onChangeText={setQ} placeholder="Buscar no catálogo" />
        {filtered.map((p) => <Button key={p.id} kind="secondary" title={productLabel(p)} onPress={() => setPid(p.id)} />)}
        <Button kind="ghost" title="Cadastrar novo produto" onPress={() => router.replace('/produto/novo')} />
      </>) : <Row style={{ justifyContent: 'space-between' }}><T variant="h2" style={{ flex: 1 }}>{productLabel(products.find((p) => p.id === pid)!)}</T><Button kind="ghost" title="Trocar" onPress={() => setPid(null)} /></Row>}
      <T variant="label">Filial</T>
      <Row style={{ flexWrap: 'wrap' }}>{stores.map((s) => <Chip key={s.id} label={s.name} selected={sid === s.id} onPress={() => setSid(s.id)} />)}</Row>
      <Field label="Preço da embalagem (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Row style={{ justifyContent: 'space-between' }}><T>Vi o preço na prateleira/etiqueta (confirmado)</T><Switch value={confirmed} onValueChange={setConfirmed} /></Row>
      <Row style={{ justifyContent: 'space-between' }}><T>É promoção</T><Switch value={promo} onValueChange={setPromo} /></Row>
      {promo ? (<>
        <Row><Field label="Leve a partir de (un.)" value={minQty} onChangeText={setMinQty} keyboardType="number-pad" style={{ flex: 1 }} /><Field label="Cada por (R$)" value={volPrice} onChangeText={setVolPrice} keyboardType="decimal-pad" style={{ flex: 1 }} /></Row>
        <Field label="Válida até (AAAA-MM-DD)" value={until} onChangeText={setUntil} placeholder="2026-12-31" />
        <Field label="Condições" value={cond} onChangeText={setCond} placeholder="Ex.: somente com cartão da rede" />
      </>) : null}
      <Row style={{ justifyContent: 'space-between' }}><T>Disponível na loja</T><Switch value={avail} onValueChange={setAvail} /></Row>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {price && cents === null ? <Notice tone="danger">Preço inválido.</Notice> : null}
      <Button title={cents ? `Salvar ${formatBRL(cents)}` : 'Salvar preço'} onPress={save} disabled={!pid || !sid || !cents || !volOk || !dateOk} />
    </Screen>
  );
}
