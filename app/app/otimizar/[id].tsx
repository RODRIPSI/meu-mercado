import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useHouse } from '@/features/house';
import { useCatalog } from '@/features/catalog';
import { useListItems } from '@/features/listsync';
import { buildDemand } from '@/features/demand';
import { optimize, type Mode } from '@/domain/optimizer';
import { formatBRL, parseBRLToCents } from '@/domain/money';

const MODES: { k: Mode; t: string; d: string }[] = [
  { k: 'A', t: 'Um mercado', d: 'Menor custo com a lista completa em um só lugar.' },
  { k: 'B', t: 'Equilibrado', d: 'Até 2 mercados, pesando economia e deslocamento.' },
  { k: 'C', t: 'Máxima economia', d: 'Melhor combinação entre os mercados escolhidos.' },
];

export default function Otimizar() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const { house } = useHouse();
  const { items } = useListItems(id, house?.id); const { stores, products, productMap, prices, equivalences, prefs } = useCatalog();
  const [mode, setMode] = useState<Mode>('A'); const [sel, setSel] = useState<string[] | null>(null);
  const [km, setKm] = useState(''); const [stops, setStops] = useState('3');
  const chosen = sel ?? stores.map((s) => s.id);
  const toggle = (sid: string) => setSel(chosen.includes(sid) ? chosen.filter((x) => x !== sid) : [...chosen, sid]);

  const result = useMemo(() => {
    const demand = buildDemand(items, equivalences, prefs);
    if (!demand.length || !chosen.length) return null;
    return optimize({ mode, items: demand, products: productMap, stores: stores.filter((s) => chosen.includes(s.id)), prices,
      costPerKmCents: parseBRLToCents(km) ?? 0, maxStops: Number(stops) || undefined });
  }, [items, equivalences, prefs, mode, chosen.join(','), km, stops, prices, stores, productMap]);

  const best = result?.best;
  const storeName = (sid: string) => stores.find((s) => s.id === sid)?.name ?? sid;

  return (
    <Screen>
      <T variant="small">Só entram preços que existem no app. Itens sem preço conhecido aparecem como “sem preço”, nunca como R$ 0,00.</T>
      <Row style={{ flexWrap: 'wrap' }}>{MODES.map((m) => <Chip key={m.k} label={m.t} selected={mode === m.k} onPress={() => setMode(m.k)} />)}</Row>
      <T variant="small">{MODES.find((m) => m.k === mode)!.d}</T>
      <T variant="label">Mercados considerados</T>
      <Row style={{ flexWrap: 'wrap' }}>{stores.map((s) => <Chip key={s.id} label={s.name} selected={chosen.includes(s.id)} onPress={() => toggle(s.id)} />)}</Row>
      <Row>
        <Field label="Custo por km rodado (R$)" value={km} onChangeText={setKm} keyboardType="decimal-pad" placeholder="0,00" />
        {mode === 'C' ? <Field label="Máx. de paradas" value={stops} onChangeText={setStops} keyboardType="number-pad" /> : null}
      </Row>

      {!result ? <Empty title="Nada para calcular" hint="Adicione itens do catálogo à lista e selecione ao menos um mercado." /> : !best ? <Notice tone="danger">Não há nenhum preço conhecido para os itens nos mercados escolhidos.</Notice> : (
        <>
          <Card>
            <T variant="label">MELHOR OPÇÃO</T>
            <T variant="title">{formatBRL(best.totalCents)}</T>
            <T variant="small">{best.storeIds.map(storeName).join(' + ')}</T>
            {best.partial ? <Badge text="comparação parcial" tone="warn" /> : null}
            <T variant="small">Itens: {formatBRL(best.itemsCents)} · Deslocamento: {best.travelCents == null ? 'não calculado' : formatBRL(best.travelCents)}</T>
            {result.basis.savingsVsAverageCents != null ? <T color="#3C7A4F" variant="label">Economia estimada: {formatBRL(result.basis.savingsVsAverageCents)} vs. média dos mercados com a lista completa</T> : null}
            {result.basis.savingsVsBestSingleCents ? <T variant="small">{formatBRL(result.basis.savingsVsBestSingleCents)} a menos que o melhor mercado único.</T> : null}
          </Card>
          {best.storeIds.map((sid) => (
            <Card key={sid}>
              <Row style={{ justifyContent: 'space-between' }}><T variant="h2">{storeName(sid)}</T>
                <Button title="Comprar aqui" kind="secondary" onPress={() => router.push(`/compra/${id}?storeId=${sid}`)} /></Row>
              {best.picks.filter((p) => p.storeId === sid).map((p) => (
                <Row key={p.itemId} style={{ justifyContent: 'space-between' }}>
                  <T style={{ flex: 1 }}>{items.find((i) => i.id === p.itemId)?.name}{p.packs > 1 ? ` ×${p.packs}` : ''}</T>
                  {p.stale ? <Badge text="desatualizado" tone="warn" /> : null}{p.demo ? <Badge text="DEMO" tone="danger" /> : null}
                  <T>{formatBRL(p.totalCents)}</T>
                </Row>
              ))}
            </Card>
          ))}
          {best.missing.length ? <Card><T variant="label" color="#B3402F">SEM PREÇO CONHECIDO</T>{best.missing.map((m) => <T key={m.itemId}>{m.name} <T variant="small">— {m.reason}</T></T>)}</Card> : null}
          <Card>
            <T variant="label">BASE DO CÁLCULO</T>
            <T variant="small">{result.basis.itemsConsidered} item(ns) · {result.basis.storesConsidered} mercado(s)</T>
            {result.basis.priceAssumptions.map((a, i) => <T key={i} variant="small">• {a}</T>)}
          </Card>
        </>
      )}
    </Screen>
  );
}
