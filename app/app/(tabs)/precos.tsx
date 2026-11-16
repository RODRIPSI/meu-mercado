import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useCatalog } from '@/features/catalog';
import { buildCompareRows } from '@/domain/compare';
import { formatBRL } from '@/domain/money';
import { unitPriceLabel } from '@/domain/units';
import { productLabel } from '@/lib/mappers';
import { useHouse } from '@/features/house';

export default function Comparador() {
  const router = useRouter(); const { house } = useHouse();
  const { products, productMap, storeMap, prices, loading, offline, syncedAt } = useCatalog();
  const [q, setQ] = useState('');
  const shown = useMemo(() => products.filter((p) => `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(q.toLowerCase())), [products, q]);
  const best = (pid: string) => buildCompareRows({ productIds: [pid], products: productMap, stores: storeMap, prices }).find((r) => r.isBest);

  return (
    <Screen>
      {offline ? <Notice>Sem conexão — dados de {syncedAt ? new Date(syncedAt).toLocaleString('pt-BR') : 'sincronização anterior'}.</Notice> : null}
      <Field label="Buscar produto" value={q} onChangeText={setQ} placeholder="Arroz, leite, café…" />
      {house!.canEdit ? (
        <Row>
          <Button title="Novo produto" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/produto/novo')} />
          <Button title="Registrar preço" style={{ flex: 1 }} onPress={() => router.push('/preco/novo')} />
        </Row>
      ) : null}
      <Button title="Ofertas dos encartes" kind="secondary" onPress={() => router.push('/ofertas')} />
      {house!.canEdit ? <Button title="Importar preços (CSV)" kind="ghost" onPress={() => router.push('/importar')} /> : null}
      {!loading && shown.length === 0 ? <Empty title="Nenhum produto cadastrado" hint="Cadastre produtos e registre os preços que você encontrar. O app nunca inventa preços." /> : null}
      {shown.map((p) => {
        const b = best(p.id);
        return (
          <Card key={p.id} onPress={() => router.push(`/produto/${p.id}`)}>
            <T variant="h2">{productLabel(p)}</T>
            {b ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <T>{formatBRL(b.price.priceCents)} · {b.store.name}</T>
                <Row>
                  {b.unitPrice ? <T variant="small">{formatBRL(b.unitPrice.cents)} {unitPriceLabel(b.unitPrice.base)}</T> : null}
                  {b.status === 'stale' ? <Badge text="desatualizado" tone="warn" /> : null}
                  {b.price.source === 'demo' ? <Badge text="DEMO" tone="danger" /> : null}
                </Row>
              </Row>
            ) : <T variant="small">Sem preço conhecido</T>}
          </Card>
        );
      })}
    </Screen>
  );
}
