import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import { useHouse } from '@/features/house';

interface ListRow { id: string; name: string; kind: 'weekly' | 'monthly' | 'custom'; status: string; created_at: string }
const KIND = { weekly: 'Semanal', monthly: 'Mensal', custom: 'Personalizada' } as const;

export default function Listas() {
  const { house } = useHouse(); const router = useRouter();
  const [lists, setLists] = useState<ListRow[]>([]); const [name, setName] = useState(''); const [kind, setKind] = useState<ListRow['kind']>('weekly');
  const [err, setErr] = useState(''); const [offline, setOffline] = useState(false);
  const key = `lists:${house!.id}`;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('shopping_lists').select('*').eq('house_id', house!.id).eq('status', 'active').order('created_at', { ascending: false });
    if (error) { setLists(await cacheGet(key, [])); setOffline(true); } else { setLists(data as ListRow[]); setOffline(false); cacheSet(key, data); }
  }, [house, key]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`lists:${house!.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists', filter: `house_id=eq.${house!.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, house]);

  const create = async () => {
    setErr('');
    const { data, error } = await supabase.from('shopping_lists').insert({ house_id: house!.id, name: name.trim(), kind }).select('id').single();
    if (error) return setErr(friendlyError(error));
    setName(''); router.push(`/lista/${data.id}`);
  };

  return (
    <Screen>
      {offline ? <Notice>Sem conexão — exibindo a última sincronização.</Notice> : null}
      {house!.canEdit ? (
        <Card>
          <T variant="h2">Nova lista</T>
          <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Compras da semana" />
          <Row style={{ flexWrap: 'wrap' }}>{(Object.keys(KIND) as ListRow['kind'][]).map((k) => <Chip key={k} label={KIND[k]} selected={kind === k} onPress={() => setKind(k)} />)}</Row>
          {err ? <Notice tone="danger">{err}</Notice> : null}
          <Button title="Criar lista" onPress={create} disabled={!name.trim() || offline} />
        </Card>
      ) : <Notice>Você tem acesso somente de leitura nesta casa.</Notice>}
      {lists.length === 0 ? <Empty title="Nenhuma lista ainda" hint="Crie a primeira lista da casa." /> : lists.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/lista/${l.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}><T variant="h2">{l.name}</T><Badge text={KIND[l.kind]} /></Row>
        </Card>
      ))}
    </Screen>
  );
}
