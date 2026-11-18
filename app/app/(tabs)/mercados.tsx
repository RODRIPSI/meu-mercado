import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Notice, Row, Screen, T } from '@/components/ui';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function Mercados() {
  const router = useRouter(); const { house } = useHouse(); const { colors } = useTheme(); const { storeRows, chains, reload, prices } = useCatalog();
  const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState('');
  const toggle = async (id: string, active: boolean) => {
    setErr('');
    const { error } = await supabase.from('stores').update({ active }).eq('id', id);
    if (error) setErr(friendlyError(error)); else reload();
  };
  const priced = new Set(prices.map((p) => p.storeId));
  return (
    <Screen>
      <T variant="small">As 7 redes monitoradas no Rio de Janeiro. Cada filial tem preços próprios — uma promoção em uma unidade não vale automaticamente para outra. Filiais desligadas ficam fora das comparações.</T>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {chains.map((c) => {
        const branches = storeRows.filter((s: any) => s.chain_id === c.id);
        const on = branches.filter((s: any) => s.active !== false).length;
        const isOpen = open === c.id;
        return (
          <Card key={c.id}>
            <Pressable onPress={() => setOpen(isOpen ? null : c.id)} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T variant="h2">{c.name}</T>
                  <T variant="small">{branches.length ? `${on} de ${branches.length} filial(is) ativa(s)` : 'Nenhuma filial escolhida'}</T>
                </View>
                <Badge text={branches.length ? 'em uso' : 'não usada'} tone={branches.length ? 'ok' : 'neutral'} />
                <T color={colors.textMuted}>{isOpen ? '▲' : '▼'}</T>
              </Row>
            </Pressable>
            {isOpen ? (
              <View style={{ gap: 8 }}>
                {branches.map((s: any) => (
                  <Row key={s.id} style={{ justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <T>{s.name}</T>
                      <T variant="small">{[s.address, s.distance_km != null ? `${s.distance_km} km de casa` : 'distância não informada', priced.has(s.id) ? null : 'sem preços ainda'].filter(Boolean).join(' · ')}</T>
                    </View>
                    <Switch value={s.active !== false} disabled={!house!.canEdit} onValueChange={(v) => toggle(s.id, v)} accessibilityLabel={`Usar ${s.name}`} trackColor={{ true: colors.sage, false: colors.border }} thumbColor={s.active !== false ? colors.primary : colors.surfaceAlt} />
                  </Row>
                ))}
                {house!.canEdit ? <Button kind="secondary" small title={`Escolher filial do ${c.name}`} onPress={() => router.push(`/mercado-novo?chain=${c.id}`)} /> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      {storeRows.some((s: any) => !s.chain_id) ? <Notice>Há filiais sem rede definida. Elas continuam valendo nas comparações.</Notice> : null}
    </Screen>
  );
}
