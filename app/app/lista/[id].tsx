import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { friendlyError, supabase } from '@/lib/supabase';
import { useListItems, type ItemRow } from '@/features/listsync';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { productLabel } from '@/lib/mappers';
import { setScanHandler } from '@/lib/scanBus';
import { formatBRL } from '@/domain/money';

export default function ListaDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const nav = useNavigation();
  const { colors } = useTheme(); const { house } = useHouse(); const { products, barcodes, productMap } = useCatalog();
  const L = useListItems(id, house?.id);
  const [name, setName] = useState(''); const [productId, setProductId] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const [listName, setListName] = useState('');

  useEffect(() => { supabase.from('shopping_lists').select('name').eq('id', id).maybeSingle().then(({ data }) => { if (data) { setListName(data.name); nav.setOptions({ title: data.name }); } }); }, [id, nav]);

  const suggestions = useMemo(() => name.trim().length < 2 || productId ? [] :
    products.filter((p) => `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(name.toLowerCase())).slice(0, 5), [name, products, productId]);

  const addNow = async (text: string, pid: string | null) => {
    const exists = L.items.some((i) => i.status === 'pending' && (pid ? i.product_id === pid : i.name.toLowerCase() === text.toLowerCase()));
    if (exists) return setMsg('Este item já está na lista.');   // evita duplicação acidental (o banco também impede)
    setMsg(''); await L.add({ name: text, productId: pid, qty: 1, unit: pid ? 'un' : 'un' });
    setName(''); setProductId(null);
  };

  const scan = () => {
    setScanHandler((code) => {
      const pid = barcodes[code];
      if (pid && productMap.get(pid)) addNow(productLabel(productMap.get(pid)!), pid);
      else setMsg(`Código ${code} não está no catálogo. Cadastre o produto em Preços → Novo produto.`);
      setScanHandler(null);
    });
    router.push('/scanner');
  };

  const duplicate = async () => {
    const { data: nl, error } = await supabase.from('shopping_lists').insert({ house_id: house!.id, name: `${listName} (cópia)`, kind: 'custom' }).select('id').single();
    if (error) return setMsg(friendlyError(error));
    const rows = L.items.filter((i) => !i.id.startsWith('local-')).map((i) => ({ list_id: nl.id, house_id: house!.id, product_id: i.product_id, name: i.name, qty: i.qty, unit: i.unit, notes: i.notes, preferred_brand: i.preferred_brand, priority: i.priority }));
    if (rows.length) await supabase.from('list_items').insert(rows);
    router.replace(`/lista/${nl.id}`);
  };
  const archive = async () => { await supabase.from('shopping_lists').update({ status: 'archived' }).eq('id', id); router.back(); };

  const pending = L.items.filter((i) => i.status === 'pending'); const done = L.items.filter((i) => i.status !== 'pending');
  const edit = house!.canEdit;
  const Item = ({ it }: { it: ItemRow }) => {
    const local = it.id.startsWith('local-');
    return (
      <Card>
        <Row>
          <Pressable disabled={!edit || local} onPress={() => L.update(it, { status: it.status === 'bought' ? 'pending' : 'bought' })} style={{ width: 44, height: 44, justifyContent: 'center' }} accessibilityLabel="Marcar como comprado">
            <Ionicons name={it.status === 'bought' ? 'checkbox' : 'square-outline'} size={28} color={colors.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <T style={it.status === 'bought' ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{it.name}</T>
            {it.product_id && productMap.get(it.product_id) ? <T variant="small">{productLabel(productMap.get(it.product_id)!)}</T> : null}
            {it.pendingSync ? <Badge text="aguardando sincronizar" tone="warn" /> : null}
            {it.est_price_cents ? <T variant="small">est. {formatBRL(it.est_price_cents)}</T> : null}
          </View>
          {edit && !local ? (
            <Row>
              <Pressable onPress={() => it.qty > 1 && L.update(it, { qty: it.qty - 1 })} style={{ width: 40, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="remove-circle-outline" size={26} color={colors.textMuted} /></Pressable>
              <T variant="h2">{Number(it.qty)}{it.unit !== 'un' ? it.unit : ''}</T>
              <Pressable onPress={() => L.update(it, { qty: Number(it.qty) + 1 })} style={{ width: 40, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="add-circle-outline" size={26} color={colors.primary} /></Pressable>
              <Pressable onPress={() => L.remove(it)} style={{ width: 40, height: 44, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="Remover"><Ionicons name="trash-outline" size={22} color={colors.danger} /></Pressable>
            </Row>
          ) : <T variant="h2">{Number(it.qty)}</T>}
        </Row>
      </Card>
    );
  };

  return (
    <Screen>
      {!L.online ? <Notice>Offline — suas alterações ficam salvas e são enviadas quando a conexão voltar.</Notice> : null}
      {L.pendingCount > 0 ? <Notice>{L.pendingCount} alteração(ões) aguardando sincronização.</Notice> : null}
      {L.conflicts.map((c, i) => (
        <Card key={i}>
          <Notice tone="danger">{c.code === 'duplicate' ? 'Item duplicado ao sincronizar.' : 'Outra pessoa alterou este item antes do envio da sua mudança.'}</Notice>
          <T variant="small">{JSON.stringify(c.mutation.kind === 'update' ? c.mutation.patch : c.mutation.kind === 'insert' ? { adicionar: c.mutation.item.name } : { remover: true })}</T>
          <Row><Button kind="secondary" title="Manter a minha" style={{ flex: 1 }} onPress={() => L.resolveConflict(c, 'mine')} /><Button kind="ghost" title="Usar a atual" style={{ flex: 1 }} onPress={() => L.resolveConflict(c, 'theirs')} /></Row>
        </Card>
      ))}
      {edit ? (
        <Card>
          <Field label="Adicionar item" value={name} onChangeText={(t) => { setName(t); setProductId(null); }} placeholder="Digite ou escolha do catálogo" returnKeyType="done" onSubmitEditing={() => name.trim() && addNow(name.trim(), productId)} />
          {suggestions.map((p) => <Button key={p.id} kind="secondary" title={productLabel(p)} onPress={() => { setName(productLabel(p)); setProductId(p.id); }} />)}
          {msg ? <Notice>{msg}</Notice> : null}
          <Row><Button title="Adicionar" style={{ flex: 1 }} disabled={!name.trim()} onPress={() => addNow(name.trim(), productId)} /><Button kind="secondary" title="Código de barras" onPress={scan} /></Row>
        </Card>
      ) : null}
      <Row>
        <Button title="Otimizar compra" style={{ flex: 1 }} onPress={() => router.push(`/otimizar/${id}`)} />
        <Button title="Modo compra" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/compra/${id}`)} />
      </Row>
      {L.loading ? <T variant="small">Carregando…</T> : pending.length === 0 && done.length === 0 ? <Empty title="Lista vazia" hint="Adicione itens acima." /> : null}
      {pending.map((i) => <Item key={i.id} it={i} />)}
      {done.length ? <T variant="label" style={{ marginTop: 8 }}>COMPRADOS ({done.length})</T> : null}
      {done.map((i) => <Item key={i.id} it={i} />)}
      {edit ? <Row><Button kind="ghost" title="Duplicar lista" style={{ flex: 1 }} onPress={duplicate} /><Button kind="ghost" title="Arquivar" style={{ flex: 1 }} onPress={archive} /></Row> : null}
    </Screen>
  );
}
