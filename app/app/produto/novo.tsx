import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';
import { setScanHandler } from '@/lib/scanBus';
import type { Unit } from '@/domain/types';

const UNITS: Unit[] = ['un', 'kg', 'g', 'l', 'ml'];

export default function ProdutoNovo() {
  const router = useRouter(); const { house } = useHouse(); const { categories, reload } = useCatalog();
  const [name, setName] = useState(''); const [brand, setBrand] = useState(''); const [qty, setQty] = useState('1'); const [unit, setUnit] = useState<Unit>('un');
  const [cat, setCat] = useState<string | null>(null); const [code, setCode] = useState(''); const [err, setErr] = useState('');
  const n = Number(qty.replace(',', '.'));
  const scan = () => { setScanHandler((c) => { setCode(c); setScanHandler(null); }); router.push('/scanner'); };
  const save = async () => {
    const { data, error } = await supabase.from('products').insert({ house_id: house!.id, name: name.trim(), brand: brand.trim() || null, pack_qty: n, unit, category_id: cat }).select('id').single();
    if (error) return setErr(error.code === '23505' ? 'Este produto (mesma marca e embalagem) já está cadastrado.' : friendlyError(error));
    if (code.trim()) {
      const b = await supabase.from('product_barcodes').insert({ house_id: house!.id, product_id: data.id, barcode: code.trim() });
      if (b.error) setErr('Produto salvo, mas o código de barras é inválido ou já usado.');
    }
    await reload(); router.replace(`/preco/novo?productId=${data.id}`);
  };
  return (
    <Screen>
      <Field label="Nome padronizado" value={name} onChangeText={setName} placeholder="Ex.: Arroz branco tipo 1" />
      <Field label="Marca" value={brand} onChangeText={setBrand} />
      <Row><Field label="Quantidade da embalagem" value={qty} onChangeText={setQty} keyboardType="decimal-pad" style={{ flex: 1 }} /></Row>
      <Row style={{ flexWrap: 'wrap' }}>{UNITS.map((u) => <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />)}</Row>
      <T variant="label">Categoria</T>
      <Row style={{ flexWrap: 'wrap' }}>{categories.map((c) => <Chip key={c.id} label={c.name} selected={cat === c.id} onPress={() => setCat(c.id)} />)}</Row>
      <Row><Field label="Código de barras (opcional)" value={code} onChangeText={setCode} keyboardType="number-pad" style={{ flex: 1 }} /><Button title="Ler" kind="secondary" onPress={scan} /></Row>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title="Salvar e registrar preço" onPress={save} disabled={!name.trim() || !(n > 0)} />
    </Screen>
  );
}
