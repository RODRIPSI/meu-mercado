import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useCatalog } from '@/features/catalog';
import { useHouse } from '@/features/house';

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null; };

export default function MercadoNovo() {
  const router = useRouter(); const { house } = useHouse(); const { chains, reload } = useCatalog();
  const [chain, setChain] = useState<string | null>(null); const [name, setName] = useState(''); const [address, setAddress] = useState('');
  const [km, setKm] = useState(''); const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [err, setErr] = useState('');
  const save = async () => {
    const { error } = await supabase.from('stores').insert({ house_id: house!.id, chain_id: chain, name: name.trim(), address: address.trim() || null, distance_km: num(km), lat: num(lat), lng: num(lng) });
    if (error) return setErr(friendlyError(error));
    await reload(); router.back();
  };
  return (
    <Screen>
      <T variant="label">Rede</T>
      <Row style={{ flexWrap: 'wrap' }}>{chains.map((c) => <Chip key={c.id} label={c.name} selected={chain === c.id} onPress={() => { setChain(c.id); if (!name) setName(c.name + ' – '); }} />)}</Row>
      <Field label="Nome da filial" value={name} onChangeText={setName} placeholder="Ex.: Guanabara – Freguesia" />
      <Field label="Endereço" value={address} onChangeText={setAddress} />
      <Field label="Distância de casa (km)" value={km} onChangeText={setKm} keyboardType="decimal-pad" />
      <Row><Field label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} /><Field label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} /></Row>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title="Salvar filial" onPress={save} disabled={!chain || !name.trim()} />
    </Screen>
  );
}
