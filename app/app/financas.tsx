import React, { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Badge, Button, Card, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useHouse } from '@/features/house';
import { supabase } from '@/lib/supabase';
import { formatBRL, parseBRLToCents } from '@/domain/money';
import { budgetStatus, monthDelta, paidByMonth } from '@/domain/finance';
import { useCatalog } from '@/features/catalog';

export default function Financas() {
  const { house } = useHouse(); const { storeMap } = useCatalog(); const edit = house!.canEdit;
  const [purchases, setPurchases] = useState<any[]>([]); const [budget, setBudget] = useState<number | null>(null); const [input, setInput] = useState('');
  const month = new Date().toISOString().slice(0, 7); const monthStart = `${month}-01`;

  const load = useCallback(async () => {
    const { data } = await supabase.from('purchases').select('id, store_id, purchased_at, total_cents, budget_cents').eq('house_id', house!.id).order('purchased_at', { ascending: false });
    setPurchases(data ?? []);
    const b = await supabase.from('budgets').select('amount_cents').eq('house_id', house!.id).eq('month', monthStart).maybeSingle();
    setBudget(b.data?.amount_cents ?? null);
  }, [house, monthStart]);
  useEffect(() => { load(); }, [load]);

  const paid = paidByMonth(purchases.map((p) => ({ purchasedAt: p.purchased_at, totalCents: p.total_cents })));
  const prevKey = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() - 1)).toISOString().slice(0, 7);
  const spent = paid[month] ?? 0; const st = budgetStatus(spent, budget); const delta = monthDelta(spent, paid[prevKey]);
  const byStore: Record<string, number> = {};
  for (const p of purchases.filter((x) => x.purchased_at.startsWith(month))) { const n = storeMap.get(p.store_id)?.name ?? 'Sem mercado'; byStore[n] = (byStore[n] ?? 0) + p.total_cents; }

  const saveBudget = async () => { const c = parseBRLToCents(input); if (!c) return; await supabase.from('budgets').upsert({ house_id: house!.id, month: monthStart, amount_cents: c }, { onConflict: 'house_id,month' }); setInput(''); load(); };
  const exportCsv = () => {
    const csv = ['data;mercado;total_pago_reais', ...purchases.map((p) => `${p.purchased_at.slice(0, 10)};${storeMap.get(p.store_id)?.name ?? ''};${(p.total_cents / 100).toFixed(2).replace('.', ',')}`)].join('\n');
    Share.share({ message: csv, title: 'compras.csv' });
  };

  return (
    <Screen>
      <Card>
        <T variant="label">GASTO PAGO EM {month}</T>
        <T variant="title">{formatBRL(spent)}</T>
        {delta != null ? <T variant="small">{delta > 0 ? '+' : ''}{delta}% em relação ao mês anterior</T> : <T variant="small">Sem mês anterior para comparar.</T>}
        {st.known ? <><Badge text={st.over ? `Acima do orçamento em ${formatBRL(-st.remainingCents)}` : `${st.usedPct}% do orçamento (${formatBRL(budget)})`} tone={st.over ? 'danger' : 'ok'} /></> : <T variant="small">Orçamento mensal não definido.</T>}
        <T variant="small">Valores pagos vêm das compras finalizadas. Economias estimadas do otimizador não entram neste total.</T>
      </Card>
      {edit ? <Card><Field label="Definir orçamento do mês (R$)" value={input} onChangeText={setInput} keyboardType="decimal-pad" /><Button kind="secondary" title="Salvar orçamento" onPress={saveBudget} disabled={!parseBRLToCents(input)} /></Card> : null}
      {Object.keys(byStore).length ? <Card><T variant="h2">Por supermercado</T>{Object.entries(byStore).map(([n, v]) => <Row key={n} style={{ justifyContent: 'space-between' }}><T>{n}</T><T>{formatBRL(v)}</T></Row>)}</Card> : null}
      <T variant="h2">Histórico de compras</T>
      {purchases.length === 0 ? <Empty title="Nenhuma compra finalizada" hint="Use o Modo compra e finalize para registrar." /> : purchases.map((p) => (
        <Card key={p.id}><Row style={{ justifyContent: 'space-between' }}><T>{new Date(p.purchased_at).toLocaleDateString('pt-BR')} · {storeMap.get(p.store_id)?.name ?? '—'}</T><T variant="h2">{formatBRL(p.total_cents)}</T></Row></Card>
      ))}
      {purchases.length ? <Button kind="secondary" title="Exportar CSV" onPress={exportCsv} /> : null}
      <Notice>Gastos por categoria e gráficos avançados: planejados para a próxima etapa.</Notice>
    </Screen>
  );
}
