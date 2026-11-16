import React, { useState } from 'react';
import { Button, Card, Field, Notice, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useHouse } from '@/features/house';

export default function Onboarding() {
  const { refresh, select } = useHouse();
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const run = async (fn: () => Promise<{ data: any; error: any }>) => {
    setBusy(true); setErr('');
    const { data, error } = await fn();
    if (error) setErr(friendlyError(error)); else { select(data as string); await refresh(); }
    setBusy(false);
  };
  return (
    <Screen>
      <T variant="title">Vamos montar sua casa</T>
      <Card>
        <T variant="h2">Criar uma casa</T>
        <Field label="Nome da casa" value={name} onChangeText={setName} placeholder="Ex.: Casa da família" />
        <Button title="Criar casa" disabled={!name.trim()} loading={busy} onPress={() => run(async () => await supabase.rpc('create_house', { p_name: name }))} />
      </Card>
      <Card>
        <T variant="h2">Entrar com um convite</T>
        <Field label="Código do convite" value={code} onChangeText={setCode} autoCapitalize="characters" />
        <Button kind="secondary" title="Entrar na casa" disabled={code.trim().length < 6} loading={busy} onPress={() => run(async () => await supabase.rpc('join_house', { p_code: code }))} />
      </Card>
      {err ? <Notice tone="danger">{err}</Notice> : null}
    </Screen>
  );
}
