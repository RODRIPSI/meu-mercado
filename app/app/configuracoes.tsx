import React, { useEffect, useState } from 'react';
import { Button, Card, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { useHouse } from '@/features/house';
import { supabase } from '@/lib/supabase';

export default function Configuracoes() {
  const { mode, setMode } = useTheme(); const { house, userId, refresh } = useHouse();
  const [me, setMe] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { supabase.from('profiles').select('display_name').eq('id', userId!).maybeSingle().then(({ data }) => setMe(data?.display_name ?? '')); }, [userId]);
  const saveName = async () => { const { error } = await supabase.from('profiles').update({ display_name: me.trim() }).eq('id', userId!); if (error) setErr('Não foi possível salvar o nome.'); else { setErr(''); setMsg('Nome salvo.'); } };
  const leave = async () => { const { error } = await supabase.from('house_members').delete().eq('house_id', house!.id).eq('user_id', userId!); if (error) setErr('Você é o único administrador. Promova outra pessoa antes de sair.'); else refresh(); };
  return (
    <Screen>
      {err ? <Notice tone="danger">{err}</Notice> : null}{msg ? <Notice tone="ok">{msg}</Notice> : null}
      <Card>
        <T variant="h2">Seu perfil</T>
        <Field label="Seu nome" value={me} onChangeText={(v) => { setMe(v); setMsg(''); }} />
        <Button kind="secondary" title="Salvar nome" onPress={saveName} disabled={!me.trim()} />
      </Card>
      <Card>
        <T variant="h2">Aparência</T>
        <Row style={{ flexWrap: 'wrap' }}>{(['system', 'light', 'dark'] as const).map((m) => <Chip key={m} label={{ system: 'Automático', light: 'Claro', dark: 'Escuro' }[m]} selected={mode === m} onPress={() => setMode(m)} />)}</Row>
      </Card>
      <Button kind="ghost" title="Sair da casa" onPress={leave} />
      <Button kind="danger" title="Sair da conta" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
