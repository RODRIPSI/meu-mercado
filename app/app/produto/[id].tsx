import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { supabase } from '@/lib/supabase';
import { buildCompareRows, acceptableProductIds } from '@/domain/compare';
import { historyStats, type Observation } from '@/domain/history';
import { sourceLabel } from '@/domain/pricing';
import { formatBRL } from '@/domain/money';
import { unitPriceLabel } from '@/domain/units';
import { productLabel } from '@/lib/mappers';

const REL = { alta: 'confiabilidade alta', media: 'confiabilidade média', baixa: 'confiabilidade baixa' } as const;

export default function ProdutoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const { colors } = useTheme();
  const { house } = useHouse(); const { productMap, storeMap, products, prices, equivalences, prefs, reload } = useCatalog();
  const product = productMap.get(id); const pref = prefs[id] ?? { favorite: false, brandLocked: false };
  const [obs, setObs] = useState<Observation[]>([]); const [storeFilter, setStoreFilter] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('price_history').select('price_cents, observed_at, is_promo, store_id').eq('product_id', id).order('observed_at').then(({ data }) => {
      setObs((data ?? []).filter((r: any) => !storeFilter || r.store_id === storeFilter).map((r: any) => ({ priceCents: r.price_cents, observedAt: r.observed_at, isPromo: r.is_promo })));
    });
  }, [id, storeFilter, prices]);

  if (!product) return <Screen><T>Produto não encontrado.</T></Screen>;
  const ids = acceptableProductIds(id, equivalences, pref.brandLocked);
  const rows = buildCompareRows({ productIds: ids, products: productMap, stores: storeMap, prices });
  const stats = historyStats(obs); const edit = house!.canEdit;
  const setPref = async (patch: Partial<{ favorite: boolean; brand_locked: boolean }>) => {
    await supabase.from('house_product_prefs').upsert({ house_id: house!.id, product_id: id, favorite: pref.favorite, brand_locked: pref.brandLocked, ...patch }, { onConflict: 'house_id,product_id' }); reload();
  };
  const addEquivalent = async (eqId: string) => { await supabase.from('product_equivalences').insert({ house_id: house!.id, product_id: id, equivalent_id: eqId }); reload(); };
  const max = Math.max(1, ...obs.map((o) => o.priceCents));

  return (
    <Screen>
      <T variant="title">{product.name}</T>
      <T variant="small">{productLabel(product)}</T>
      {edit ? <Row style={{ flexWrap: 'wrap' }}>
        <Chip label={pref.favorite ? '★ Favorito' : '☆ Favorito'} selected={pref.favorite} onPress={() => setPref({ favorite: !pref.favorite })} />
        <Chip label={pref.brandLocked ? 'Só esta marca' : 'Aceita equivalentes'} selected={pref.brandLocked} onPress={() => setPref({ brand_locked: !pref.brandLocked })} />
      </Row> : null}
      <Row><Button title="Registrar preço" style={{ flex: 1 }} onPress={() => router.push(`/preco/novo?productId=${id}`)} disabled={!edit} /></Row>

      <T variant="h2">Comparação por mercado</T>
      {rows.length === 0 ? <Notice>Nenhum preço conhecido. O app nunca estima ou inventa preços.</Notice> : rows.map((r) => (
        <Card key={r.price.id} style={r.isBest ? { borderColor: colors.ok, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}><T variant="h2">{r.store.name}</T><T variant="h2">{formatBRL(r.price.priceCents)}</T></Row>
          {r.product.id !== id ? <T variant="small">Equivalente: {productLabel(r.product)}</T> : <T variant="small">{r.product.packQty}{r.product.unit}</T>}
          {r.unitPrice ? <T variant="small">{formatBRL(r.unitPrice.cents)} {unitPriceLabel(r.unitPrice.base)}</T> : null}
          <Row style={{ flexWrap: 'wrap' }}>
            {r.isBest ? <Badge text="menor preço" tone="ok" /> : null}
            {r.price.isPromo ? <Badge text="promoção" tone="accent" /> : null}
            {r.status === 'stale' ? <Badge text="desatualizado" tone="warn" /> : null}
            {r.status === 'expired' ? <Badge text="oferta vencida" tone="danger" /> : null}
            {r.price.source === 'demo' ? <Badge text="DEMONSTRAÇÃO" tone="danger" /> : <Badge text={sourceLabel(r.price.source)} />}
            <Badge text={REL[r.reliability]} tone={r.reliability === 'alta' ? 'ok' : r.reliability === 'media' ? 'neutral' : 'warn'} />
          </Row>
          <T variant="small">Verificado em {new Date(r.price.observedAt).toLocaleDateString('pt-BR')}{r.price.validUntil ? ` · válido até ${new Date(r.price.validUntil).toLocaleDateString('pt-BR')}` : ''}</T>
          {r.price.promoMinQty ? <T variant="small">Leve {r.price.promoMinQty}+ por {formatBRL(r.price.promoUnitPriceCents)} cada</T> : null}
          {r.price.conditions ? <T variant="small">Condição: {r.price.conditions}</T> : null}
        </Card>
      ))}

      <T variant="h2">Histórico</T>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Todos" selected={!storeFilter} onPress={() => setStoreFilter(null)} />
        {[...storeMap.values()].map((s) => <Chip key={s.id} label={s.name} selected={storeFilter === s.id} onPress={() => setStoreFilter(s.id)} />)}
      </Row>
      {obs.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 3 }}>
            {obs.slice(-30).map((o, i) => <View key={i} style={{ flex: 1, height: Math.max(4, (o.priceCents / max) * 90), backgroundColor: o.isPromo ? colors.accent : colors.sage, borderRadius: 3 }} />)}
          </View>
          <T variant="small">{obs.length} registro(s). Barras em destaque = promoção.</T>
        </Card>
      ) : null}
      {stats.sufficient ? (
        <Card>
          <T>Média {formatBRL(stats.avgCents)} · menor {formatBRL(stats.minCents)} · maior {formatBRL(stats.maxCents)}</T>
          <T>Variação {stats.variationPct > 0 ? '+' : ''}{stats.variationPct}% · promoções em {Math.round(stats.promoFrequency * 100)}% dos registros</T>
          <T>Economia potencial vs. menor registrado: {formatBRL(stats.potentialSavingCents)}</T>
          <Badge text={`Oportunidade: ${stats.opportunity}`} tone={stats.opportunity === 'boa' ? 'ok' : stats.opportunity === 'alta' ? 'warn' : 'neutral'} />
        </Card>
      ) : <Notice>Histórico insuficiente para conclusões. {stats.reason}</Notice>}

      {edit ? (<>
        <T variant="h2">Equivalentes aceitos</T>
        {products.filter((p) => p.id !== id && !ids.includes(p.id)).slice(0, 8).map((p) => <Button key={p.id} kind="secondary" title={`+ ${productLabel(p)}`} onPress={() => addEquivalent(p.id)} />)}
      </>) : null}
    </Screen>
  );
}
