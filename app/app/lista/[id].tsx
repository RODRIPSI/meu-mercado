import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, Empty, Field, Notice, ProgressBar, Row, Screen, Segmented, Sheet, T } from '@/components/ui';
import { space, useTheme } from '@/theme';
import { friendlyError, supabase } from '@/lib/supabase';
import { useListItems, type ItemRow } from '@/features/listsync';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { productLabel } from '@/lib/mappers';
import { setScanHandler } from '@/lib/scanBus';
import { formatBRL } from '@/domain/money';
import { buildDemand } from '@/features/demand';
import { optimize, type Mode } from '@/domain/optimizer';
import { groupByCategory, groupByStore, moveItem, sortCustom, effectiveCategory } from '@/domain/listview';
import { estimateListCost, listStatus, progress, STATUS_LABEL } from '@/domain/listparse';

export default function ListaDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const nav = useNavigation();
  const { colors } = useTheme(); const { house } = useHouse(); const { products, barcodes, productMap, categories, stores, prices, equivalences, prefs } = useCatalog();
  const L = useListItems(id, house?.id);
  const [view, setView] = useState<'categoria' | 'mercado' | 'custom'>('categoria');
  const [mode, setMode] = useState<Mode>('A');
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [otherLists, setOtherLists] = useState<{ id: string; name: string }[]>([]);
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
    const rows = L.items.filter((i) => !i.id.startsWith('local-')).map((i) => ({ list_id: nl.id, house_id: house!.id, product_id: i.product_id, name: i.name, qty: i.qty, unit: i.unit, notes: i.notes, preferred_brand: i.preferred_brand, priority: i.priority, category_id: i.category_id, position: i.position }));
    if (rows.length) await supabase.from('list_items').insert(rows);
    router.replace(`/lista/${nl.id}`);
  };
  const archive = async () => { await supabase.from('shopping_lists').update({ status: 'archived' }).eq('id', id); router.back(); };

  const items = useMemo(() => L.items.filter((i) => !i.list_id || i.list_id === id), [L.items, id]);
  const edit = house!.canEdit;
  const catName = (cid: string) => categories.find((c) => c.id === cid)?.name;
  const activeStores = useMemo(() => stores.filter((s) => s.active !== false), [stores]);
  const pendingItems = items.filter((i) => i.status === 'pending');
  const doneItems = items.filter((i) => i.status === 'bought');
  const prog = progress(items); const status = listStatus(items);

  const plan = useMemo(() => {
    const demand = buildDemand(pendingItems, equivalences, prefs);
    if (!demand.length || !activeStores.length) return null;
    return optimize({ mode, items: demand, products: productMap, stores: activeStores, prices, maxStops: mode === 'C' ? 3 : undefined });
  }, [pendingItems.map((i) => i.id + i.qty).join(','), equivalences, prefs, mode, activeStores, prices, productMap]);
  const picks = plan?.best?.picks ?? [];
  const cost = estimateListCost(pendingItems.map((i) => ({ cents: picks.find((p) => p.itemId === i.id)?.totalCents ?? null })));
  const storeName = (sid: string) => stores.find((s) => s.id === sid)?.name ?? '—';

  const openEdit = async (it: ItemRow) => {
    setEditing(it);
    const { data } = await supabase.from('shopping_lists').select('id, name').eq('house_id', house!.id).eq('status', 'active').neq('id', id).order('created_at', { ascending: false });
    setOtherLists(data ?? []);
  };
  const reorder = async (ordered: ItemRow[], itemId: string, dir: -1 | 1) => {
    for (const ch of moveItem(ordered, itemId, dir)) { const it = items.find((x) => x.id === ch.id); if (it && !it.id.startsWith('local-')) await L.update(it, { position: ch.position }); }
  };

  const Line = ({ it, ordered }: { it: ItemRow; ordered?: ItemRow[] }) => {
    const local = it.id.startsWith('local-');
    const pick = picks.find((p) => p.itemId === it.id);
    const idx = ordered ? ordered.findIndex((x) => x.id === it.id) : -1;
    return (
      <Card style={{ paddingVertical: space.sm }}>
        <Row>
          <Pressable disabled={!edit || local} onPress={() => L.update(it, { status: it.status === 'bought' ? 'pending' : 'bought' })} style={{ width: 44, height: 44, justifyContent: 'center' }} accessibilityLabel="Marcar como comprado">
            <Ionicons name={it.status === 'bought' ? 'checkbox' : 'square-outline'} size={28} color={colors.primary} />
          </Pressable>
          <Pressable style={{ flex: 1 }} disabled={!edit || local} onPress={() => openEdit(it)}>
            <T style={it.status === 'bought' ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{it.name}</T>
            <T variant="small">{[it.preferred_brand ? `marca: ${it.preferred_brand}` : null, it.notes].filter(Boolean).join(' · ') || (it.product_id && productMap.get(it.product_id) ? productLabel(productMap.get(it.product_id)!) : '')}</T>
            {it.pendingSync ? <Badge text="aguardando sincronizar" tone="warn" /> : null}
            {pick && it.status === 'pending' ? <T variant="small" color={colors.ok}>{formatBRL(pick.totalCents)} em {storeName(pick.storeId)}</T> : null}
          </Pressable>
          <T variant="h2">{Number(it.qty)}{it.unit !== 'un' ? it.unit : ''}</T>
          {ordered && edit && !local ? (
            <View>
              <Pressable disabled={idx <= 0} onPress={() => reorder(ordered, it.id, -1)} accessibilityLabel="Subir" style={{ height: 24, width: 36, alignItems: 'center' }}><Ionicons name="chevron-up" size={20} color={idx <= 0 ? colors.border : colors.primary} /></Pressable>
              <Pressable disabled={idx >= ordered.length - 1} onPress={() => reorder(ordered, it.id, 1)} accessibilityLabel="Descer" style={{ height: 24, width: 36, alignItems: 'center' }}><Ionicons name="chevron-down" size={20} color={idx >= ordered.length - 1 ? colors.border : colors.primary} /></Pressable>
            </View>
          ) : null}
        </Row>
      </Card>
    );
  };

  const groups = view === 'categoria' ? groupByCategory(pendingItems, catName)
    : view === 'mercado' ? groupByStore(pendingItems, picks, storeName)
    : [{ key: 'ordem', title: 'Minha ordem', items: sortCustom(pendingItems) }];

  const saveEdit = async (patch: Parameters<typeof L.update>[1]) => { if (editing) await L.update(editing, patch); setEditing(null); };
  const [qtyTxt, setQtyTxt] = useState(''); const [brandTxt, setBrandTxt] = useState(''); const [notesTxt, setNotesTxt] = useState('');
  useEffect(() => { if (editing) { setQtyTxt(String(Number(editing.qty)).replace('.', ',')); setBrandTxt(editing.preferred_brand ?? ''); setNotesTxt(editing.notes ?? ''); } }, [editing]);
  const qtyNum = Number(qtyTxt.replace(',', '.'));

  return (
    <Screen>
      {!L.online ? <Notice>Offline — suas alterações ficam salvas e são enviadas quando a conexão voltar.</Notice> : null}
      {L.pendingCount > 0 ? <Notice>{L.pendingCount} alteração(ões) aguardando sincronização.</Notice> : null}
      {L.conflicts.map((c, i) => (
        <Card key={i}>
          <Notice tone="danger">{c.code === 'duplicate' ? 'Já existe um item igual na lista de destino ou duplicado ao sincronizar.' : 'Outra pessoa alterou este item antes do envio da sua mudança.'}</Notice>
          <T variant="small">{JSON.stringify(c.mutation.kind === 'update' ? c.mutation.patch : c.mutation.kind === 'insert' ? { adicionar: c.mutation.item.name } : { remover: true })}</T>
          <Row><Button kind="secondary" title="Manter a minha" style={{ flex: 1 }} onPress={() => L.resolveConflict(c, 'mine')} /><Button kind="ghost" title="Usar a atual" style={{ flex: 1 }} onPress={() => L.resolveConflict(c, 'theirs')} /></Row>
        </Card>
      ))}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}><T variant="small">{prog.bought} de {prog.total} comprados</T><Badge text={STATUS_LABEL[status]} tone={status === 'concluida' ? 'ok' : status === 'em_andamento' ? 'accent' : 'neutral'} /></Row>
        <ProgressBar pct={prog.pct} />
        <T variant="small">{cost.totalCents != null ? `Estimativa dos pendentes: ${formatBRL(cost.totalCents)}${cost.unknown ? ` (${cost.unknown} sem preço conhecido, fora da conta)` : ''}` : 'Sem preços conhecidos para estimar o custo.'}</T>
      </Card>

      {edit ? (
        <Card>
          <Field label="Adicionar item" value={name} onChangeText={(t) => { setName(t); setProductId(null); }} placeholder="Digite ou escolha do catálogo" returnKeyType="done" onSubmitEditing={() => name.trim() && addNow(name.trim(), productId)} />
          {suggestions.map((p) => <Button key={p.id} kind="secondary" small title={productLabel(p)} onPress={() => { setName(productLabel(p)); setProductId(p.id); }} />)}
          {msg ? <Notice>{msg}</Notice> : null}
          <Row><Button title="Adicionar" style={{ flex: 1 }} disabled={!name.trim()} onPress={() => addNow(name.trim(), productId)} /><Button kind="secondary" title="Código de barras" onPress={scan} /></Row>
        </Card>
      ) : null}
      <Row>
        <Button title="Otimizar compra" style={{ flex: 1 }} onPress={() => router.push(`/otimizar/${id}`)} />
        <Button title="Modo compra" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/compra/${id}`)} />
      </Row>

      <Segmented value={view} onChange={setView} options={[{ key: 'categoria', label: 'Por categoria' }, { key: 'mercado', label: 'Por mercado' }, { key: 'custom', label: 'Minha ordem' }]} />
      {view === 'mercado' ? (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {([['A', 'Um mercado'], ['B', 'Equilibrado'], ['C', 'Máx. economia']] as [Mode, string][]).map(([k, l]) => <Chip key={k} label={l} selected={mode === k} onPress={() => setMode(k)} />)}
          </Row>
          {!picks.length ? <Notice>Sem preços conhecidos nos mercados ativos: os itens ficam em “Sem preço conhecido”. Cadastre preços ou aguarde a leitura dos encartes.</Notice> : null}
        </>
      ) : null}

      {L.loading ? <T variant="small">Carregando…</T> : items.length === 0 ? <Empty title="Lista vazia" hint="Adicione itens acima ou use “Importar lista”." /> : null}
      {groups.map((g) => (
        <View key={g.key} style={{ gap: space.sm }}>
          <T variant="label" style={{ marginTop: 6 }}>{g.title.toUpperCase()} ({g.items.length})</T>
          {g.items.map((i) => <Line key={i.id} it={i} ordered={view === 'custom' ? g.items : undefined} />)}
        </View>
      ))}
      {doneItems.length ? <T variant="label" style={{ marginTop: 8 }}>COMPRADOS ({doneItems.length})</T> : null}
      {doneItems.map((i) => <Line key={i.id} it={i} />)}
      {edit ? <Row><Button kind="ghost" title="Duplicar lista" style={{ flex: 1 }} onPress={duplicate} /><Button kind="ghost" title="Arquivar" style={{ flex: 1 }} onPress={archive} /></Row> : null}

      <Sheet visible={!!editing} title={editing?.name ?? ''} onClose={() => setEditing(null)}>
        {editing ? (
          <>
            <Row>
              <Field label="Quantidade" value={qtyTxt} onChangeText={setQtyTxt} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Marca preferida" value={brandTxt} onChangeText={setBrandTxt} style={{ flex: 2 }} placeholder="Opcional" />
            </Row>
            <Field label="Observações" value={notesTxt} onChangeText={setNotesTxt} multiline placeholder="Ex.: sem lactose" />
            <T variant="small">Categoria: {effectiveCategory(editing, catName)}</T>
            <Row style={{ flexWrap: 'wrap' }}>
              {categories.map((c) => <Chip key={c.id} label={c.name} selected={editing.category_id === c.id} onPress={() => saveEdit({ category_id: c.id })} />)}
            </Row>
            <Button title="Salvar" disabled={!(qtyNum > 0)} onPress={() => saveEdit({ qty: qtyNum, preferred_brand: brandTxt.trim() || null, notes: notesTxt.trim() || null })} />
            {otherLists.length ? (
              <>
                <T variant="label">MOVER PARA OUTRA LISTA</T>
                <Row style={{ flexWrap: 'wrap' }}>{otherLists.map((l) => <Chip key={l.id} label={l.name} onPress={() => saveEdit({ list_id: l.id })} />)}</Row>
              </>
            ) : null}
            <Button kind="danger" title="Remover da lista" onPress={() => { L.remove(editing); setEditing(null); }} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
