import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Badge, Button, Card, Chip, Empty, Field, Notice, ProgressBar, Row, Screen, Sheet, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/cache';
import { useHouse } from '@/features/house';
import { useMembers } from '@/features/members';
import { useCatalog } from '@/features/catalog';
import { formatBRL } from '@/domain/money';
import { listStatus, progress, STATUS_LABEL } from '@/domain/listparse';
import { optimize } from '@/domain/optimizer';
import { buildDemand } from '@/features/demand';
import type { ItemRow } from '@/features/listsync';

interface ListRow { id: string; name: string; kind: 'weekly' | 'monthly' | 'custom'; status: string; created_at: string; updated_at: string; period_start: string | null; period_end: string | null }
type Light = Pick<ItemRow, 'id' | 'list_id' | 'status' | 'updated_at' | 'qty' | 'unit' | 'name' | 'product_id' | 'version'> & { updated_by: string | null };
const KIND = { weekly: 'Semanal', monthly: 'Mensal', custom: 'Personalizada' } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const isoDate = (t: string) => { const m = t.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export default function Listas() {
  const { house } = useHouse(); const router = useRouter(); const members = useMembers(house?.id);
  const { stores, products, productMap, prices, equivalences, prefs } = useCatalog();
  const [lists, setLists] = useState<ListRow[]>([]); const [items, setItems] = useState<Light[]>([]);
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [kind, setKind] = useState<ListRow['kind']>('weekly');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState(''); const [offline, setOffline] = useState(false);
  const key = `lists2:${house!.id}`;

  const load = useCallback(async () => {
    const [l, it] = await Promise.all([
      supabase.from('shopping_lists').select('*').eq('house_id', house!.id).eq('status', 'active').order('updated_at', { ascending: false }),
      supabase.from('list_items').select('id, list_id, status, updated_at, qty, unit, name, product_id, version, updated_by').eq('house_id', house!.id),
    ]);
    if (l.error || it.error) { const c = await cacheGet<{ l: ListRow[]; it: Light[] }>(key, { l: [], it: [] }); setLists(c.l); setItems(c.it); setOffline(true); return; }
    setLists(l.data as ListRow[]); setItems(it.data as Light[]); setOffline(false); cacheSet(key, { l: l.data, it: it.data });
  }, [house, key]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`lists:${house!.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists', filter: `house_id=eq.${house!.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `house_id=eq.${house!.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, house]);

  const activeStores = useMemo(() => stores.filter((s) => s.active !== false), [stores]);
  const summary = useMemo(() => Object.fromEntries(lists.map((l) => {
    const its = items.filter((i) => i.list_id === l.id);
    const pend = its.filter((i) => i.status === 'pending');
    let cents: number | null = null, unknown = pend.length;
    if (pend.length && activeStores.length) {
      const r = optimize({ mode: 'A', items: buildDemand(pend as unknown as ItemRow[], equivalences, prefs), products: productMap, stores: activeStores, prices });
      const picks = r.best?.picks ?? []; if (picks.length) { cents = picks.reduce((a, p) => a + p.totalCents, 0); unknown = pend.length - picks.length; }
    }
    const who = new Set(its.map((i) => i.updated_by).filter(Boolean) as string[]);
    const lastIso = [l.updated_at, ...its.map((i) => i.updated_at)].sort().pop()!;
    return [l.id, { prog: progress(its), status: listStatus(its), cents, unknown, who, lastIso, n: its.length }];
  })), [lists, items, activeStores, equivalences, prefs, productMap, prices]);

  const dateErr = (from && !isoDate(from)) || (to && !isoDate(to)) ? 'Use o formato dd/mm/aaaa.' : (from && to && isoDate(from)! > isoDate(to)!) ? 'A data final vem antes da inicial.' : '';
  const create = async () => {
    setErr('');
    const { data, error } = await supabase.from('shopping_lists').insert({ house_id: house!.id, name: name.trim(), kind, period_start: from ? isoDate(from) : null, period_end: to ? isoDate(to) : null }).select('id').single();
    if (error) return setErr(friendlyError(error));
    setName(''); setFrom(''); setTo(''); setOpen(false); router.push(`/lista/${data.id}`);
  };

  return (
    <Screen>
      {offline ? <Notice>Sem conexão — exibindo a última sincronização.</Notice> : null}
      {house!.canEdit ? (
        <Row>
          <Button title="＋ Criar lista" style={{ flex: 1 }} onPress={() => setOpen(true)} disabled={offline} />
          <Button title="Importar lista" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/importar-lista')} disabled={offline} />
        </Row>
      ) : <Notice>Você tem acesso somente de leitura nesta casa.</Notice>}

      {lists.length === 0 ? <Empty title="Nenhuma lista ainda" hint="Crie a primeira lista da casa ou importe uma já pronta." /> : lists.map((l) => {
        const s = (summary as any)[l.id]; if (!s) return null;
        const mine = members.filter((m) => s.who.has(m.user_id));
        return (
          <Card key={l.id} onPress={() => router.push(`/lista/${l.id}`)}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T variant="h2">{l.name}</T>
                <T variant="small">{KIND[l.kind]}{l.period_start || l.period_end ? ` · ${l.period_start ? fmtDate(l.period_start) : '…'} a ${l.period_end ? fmtDate(l.period_end) : '…'}` : ''}</T>
              </View>
              <Badge text={STATUS_LABEL[s.status as keyof typeof STATUS_LABEL]} tone={s.status === 'concluida' ? 'ok' : s.status === 'em_andamento' ? 'accent' : 'neutral'} />
            </Row>
            <ProgressBar pct={s.prog.pct} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small">{s.prog.bought} de {s.prog.total} comprados</T>
              <T variant="small">{s.cents != null ? `≈ ${formatBRL(s.cents)}${s.unknown ? ` + ${s.unknown} sem preço` : ''}` : s.n ? 'sem preços para estimar' : 'lista vazia'}</T>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: 4 }}>{mine.slice(0, 4).map((m) => <Avatar key={m.user_id} name={m.display_name} />)}{mine.length === 0 ? <T variant="small">Sem edições ainda</T> : null}</Row>
              <T variant="small">Atualizada em {fmtDate(s.lastIso)}</T>
            </Row>
          </Card>
        );
      })}

      <Sheet visible={open} title="Criar lista" onClose={() => setOpen(false)}>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Compras da semana" autoFocus />
        <Row style={{ flexWrap: 'wrap' }}>{(Object.keys(KIND) as ListRow['kind'][]).map((k) => <Chip key={k} label={KIND[k]} selected={kind === k} onPress={() => setKind(k)} />)}</Row>
        <Row>
          <Field label="Início (opcional)" value={from} onChangeText={setFrom} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
          <Field label="Fim (opcional)" value={to} onChangeText={setTo} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
        </Row>
        {dateErr || err ? <Notice tone="danger">{dateErr || err}</Notice> : null}
        <Button title="Criar lista" onPress={create} disabled={!name.trim() || !!dateErr} />
      </Sheet>
    </Screen>
  );
}
