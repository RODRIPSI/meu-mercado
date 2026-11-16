import React from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Screen, T } from '@/components/ui';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';

export default function Mercados() {
  const router = useRouter(); const { house } = useHouse(); const { storeRows, chains } = useCatalog();
  const chainName = (id: string) => chains.find((c) => c.id === id)?.name ?? '';
  return (
    <Screen>
      <T variant="small">Cada filial tem seus próprios preços. Uma promoção em uma unidade não vale automaticamente para outra.</T>
      {house!.canEdit ? <Button title="Adicionar filial" onPress={() => router.push('/mercado-novo')} /> : null}
      {storeRows.length === 0 ? <Empty title="Nenhuma filial cadastrada" hint="Adicione as filiais que você costuma visitar." /> : null}
      {storeRows.map((s: any) => (
        <Card key={s.id}>
          <T variant="h2">{s.name}</T>
          <T variant="small">{chainName(s.chain_id)}{s.address ? ` · ${s.address}` : ''}</T>
          <T variant="small">{s.distance_km != null ? `${s.distance_km} km de casa` : 'Distância não informada'}</T>
        </Card>
      ))}
    </Screen>
  );
}
