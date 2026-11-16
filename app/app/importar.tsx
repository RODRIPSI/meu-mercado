import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Field, Notice, Screen, T } from '@/components/ui';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { friendlyError, supabase } from '@/lib/supabase';
import { parseImport, resolveImport } from '@/domain/importer';
import { formatBRL } from '@/domain/money';

const EXEMPLO = 'produto;marca;embalagem;unidade;mercado;preco;promo;validade;condicoes\n';

export default function Importar() {
  const router = useRouter(); const { house } = useHouse(); const { products, stores, reload } = useCatalog();
  const [text, setText] = useState(EXEMPLO); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  const parsed = useMemo(() => parseImport(text), [text]);
  const resolved = useMemo(() => resolveImport(parsed.rows, products, stores), [parsed, products, stores]);
  const ok = resolved.filter((r) => r.storeId);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const ref = `importação ${new Date().toISOString().slice(0, 10)}`;
      for (const r of ok) {
        let pid = r.productId;
        if (!pid) {
          const { data, error } = await supabase.from('products').insert({ house_id: house!.id, name: r.row.name, brand: r.row.brand, pack_qty: r.row.packQty, unit: r.row.unit }).select('id').single();
          if (error) throw error; pid = data.id;
        }
        const { error } = await supabase.from('prices').upsert({ house_id: house!.id, product_id: pid, store_id: r.storeId, price_cents: r.row.priceCents, source: 'imported', source_ref: ref, observed_at: new Date().toISOString(), is_promo: r.row.isPromo, valid_until: r.row.validUntil, conditions: r.row.conditions, available: true }, { onConflict: 'house_id,product_id,store_id' });
        if (error) throw error;
      }
      await reload(); setDone(`${ok.length} preço(s) importado(s).`);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <Screen>
      <T variant="small">Cole um CSV (separador ; , ou tab). Colunas: produto;marca;embalagem;unidade;mercado;preco;promo;validade;condicoes. Cada linha precisa de preço real e de uma filial já cadastrada. Nada é gravado sem a sua conferência.</T>
      <Field label="Dados" value={text} onChangeText={setText} multiline style={{ minHeight: 140 }} autoCapitalize="none" />
      {parsed.errors.map((e, i) => <Notice key={i} tone="danger">Linha {e.line}: {e.message}</Notice>)}
      {resolved.map((r, i) => (
        <Card key={i}>
          <T>{r.row.name}{r.row.brand ? ` · ${r.row.brand}` : ''} {r.row.packQty}{r.row.unit}</T>
          <T variant="small">{r.row.storeName} · {formatBRL(r.row.priceCents)}</T>
          {r.problem ? <Badge text={r.problem} tone="danger" /> : <Badge text={r.productId ? 'produto existente' : 'novo produto será criado'} tone={r.productId ? 'ok' : 'neutral'} />}
        </Card>
      ))}
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      <Button title={`Importar ${ok.length} linha(s) conferida(s)`} onPress={run} loading={busy} disabled={!ok.length} />
      <Button title="Voltar" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
