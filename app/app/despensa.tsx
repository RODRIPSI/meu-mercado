import React, { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { useHouse } from '@/features/house';
import { friendlyError, supabase } from '@/lib/supabase';
import { estimateDaysLeft, expiringSoon, needsRestock } from '@/domain/pantry';

interface P { id: string; name: string; qty: number; unit: string; min_qty: number | null; expires_on: string | null; days?: number | null }

export default function Despensa() {
  const { colors } = useTheme(); const { house } = useHouse(); const edit = house!.canEdit;
  const [rows, setRows] = useState<P[]>([]); const [name, setName] = useState(''); const [qty, setQty] = useState('1'); const [min, setMin] = useState(''); const [exp, setExp] = useState(''); const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('pantry_items').select('*').eq('house_id', house!.id).order('name');
    const { data: mv } = await supabase.from('stock_movements').select('pantry_item_id, delta, reason, created_at').eq('house_id', house!.id);
    setRows((data ?? []).map((r: any) => ({ ...r, qty: Number(r.qty), days: estimateDaysLeft(Number(r.qty), (mv ?? []).filter((m: any) => m.pantry_item_id === r.id).map((m: any) => ({ delta: Number(m.delta), reason: m.reason, at: m.created_at })))?.days ?? null })));
  }, [house]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const { error } = await supabase.from('pantry_items').insert({ house_id: house!.id, name: name.trim(), qty: Number(qty.replace(',', '.')) || 0, min_qty: min ? Number(min.replace(',', '.')) : null, expires_on: exp || null });
    if (error) return setErr(friendlyError(error)); setName(''); setExp(''); load();
  };
  const move = async (p: P, delta: number, reason: 'consumption' | 'purchase') => {
    if (p.qty + delta < 0) return;
    await supabase.from('pantry_items').update({ qty: p.qty + delta }).eq('id', p.id);
    await supabase.from('stock_movements').insert({ house_id: house!.id, pantry_item_id: p.id, delta, reason }); load();
  };
  const toList = async (p: P) => {
    let { data: l } = await supabase.from('shopping_lists').select('id').eq('house_id', house!.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!l) { const r = await supabase.from('shopping_lists').insert({ house_id: house!.id, name: 'Reposição da despensa', kind: 'custom' }).select('id').single(); l = r.data; }
    const { error } = await supabase.from('list_items').insert({ list_id: l!.id, house_id: house!.id, name: p.name, qty: Math.max(1, (p.min_qty ?? 1) * 2 - p.qty), unit: p.unit });
    setErr(error ? (error.code === '23505' ? 'Já está na lista.' : friendlyError(error)) : 'Adicionado à lista.');
  };

  return (
    <Screen>
      {edit ? <Card>
        <Field label="Produto" value={name} onChangeText={setName} />
        <Row><Field label="Quantidade" value={qty} onChangeText={setQty} keyboardType="decimal-pad" style={{ flex: 1 }} /><Field label="Mínimo (alerta)" value={min} onChangeText={setMin} keyboardType="decimal-pad" style={{ flex: 1 }} /></Row>
        <Field label="Validade (AAAA-MM-DD)" value={exp} onChangeText={setExp} />
        <Button title="Adicionar à despensa" onPress={add} disabled={!name.trim()} />
      </Card> : null}
      {err ? <Notice>{err}</Notice> : null}
      {rows.length === 0 ? <Empty title="Despensa vazia" /> : rows.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}><T variant="h2">{p.name}</T><T variant="h2">{p.qty}</T></Row>
          <Row style={{ flexWrap: 'wrap' }}>
            {needsRestock(p.qty, p.min_qty) ? <Badge text="repor" tone="warn" /> : null}
            {expiringSoon(p.expires_on) ? <Badge text={`vence ${new Date(p.expires_on + 'T12:00:00').toLocaleDateString('pt-BR')}`} tone="danger" /> : null}
            {p.days != null ? <Badge text={`dura ~${p.days} dias (estimativa)`} /> : null}
          </Row>
          {edit ? <Row>
            <Pressable onPress={() => move(p, -1, 'consumption')} style={{ padding: 8 }} accessibilityLabel="Dar baixa"><Ionicons name="remove-circle" size={32} color={colors.textMuted} /></Pressable>
            <Pressable onPress={() => move(p, 1, 'purchase')} style={{ padding: 8 }} accessibilityLabel="Adicionar"><Ionicons name="add-circle" size={32} color={colors.primary} /></Pressable>
            {needsRestock(p.qty, p.min_qty) ? <Button kind="secondary" title="Pôr na lista" onPress={() => toList(p)} /> : null}
          </Row> : null}
        </Card>
      ))}
    </Screen>
  );
}
