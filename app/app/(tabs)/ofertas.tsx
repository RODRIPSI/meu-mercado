import React, { useState } from 'react';
import { Card, Screen, Segmented, T } from '@/components/ui';
import OffersPanel from '@/panels/OffersPanel';
import ComparePanel from '@/panels/ComparePanel';

export default function OfertasTab() {
  const [tab, setTab] = useState<'ofertas' | 'comparar'>('ofertas');
  return (
    <Screen>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'ofertas', label: 'Ofertas' }, { key: 'comparar', label: 'Comparar produtos' }]} />
      {tab === 'ofertas' ? (
        <>
          <Card><T variant="h2">Leitura automática de encartes</T><T variant="small">O app lê os encartes das redes, valida preço e validade e só mostra o que passou na checagem — comparando com a sua lista.</T></Card>
          <OffersPanel />
        </>
      ) : <ComparePanel />}
    </Screen>
  );
}
