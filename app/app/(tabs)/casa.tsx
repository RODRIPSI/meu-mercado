import React, { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Field, Notice, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { useHouse, type Member } from '@/features/house';
import { friendlyError, supabase } from '@/lib/supabase';

export default function Casa() {
  const router = useRouter(); const { mode, setMode } = useTheme(); const { house, houses, select, userId, refresh } = useHouse();
  const [members, setMembers] = useState<Member[]>([]); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [me, setMe] = useState('');
  const admin = house!.role === 'admin';

  const load = useCallback(async () => {
    const { data: m } = await supabase.from('house_members').select('user_id, role, can_edit').eq('house_id', house!.id);
    const ids = (m ?? []).map((x: any) => x.user_id);
    const { data: p } = await supabase.from('profiles').select('id, display_name').in('id', ids);
    const names = new Map((p ?? []).map((x: any) => [x.id, x.display_name]));
    setMembers((m ?? []).map((x: any) => ({ ...x, display_name: names.get(x.user_id) || 'Integrante' })));
    setMe(String(names.get(userId!) ?? ''));
  }, [house, userId]);
  useEffect(() => { load(); const ch = supabase.channel(`members:${house!.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'house_members', filter: `house_id=eq.${house!.id}` }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load, house]);

  const invite = async () => {
    const { data, error } = await supabase.rpc('create_invite', { p_house: house!.id, p_hours: 72, p_max_uses: 5 });
    if (error) return setErr(friendlyError(error)); setCode(data as string);
  };
  const toggleEdit = async (m: Member) => { const { error } = await supabase.from('house_members').update({ can_edit: !m.can_edit }).eq('house_id', house!.id).eq('user_id', m.user_id); if (error) setErr(friendlyError(error)); };
  const remove = async (m: Member) => { const { error } = await supabase.from('house_members').delete().eq('house_id', house!.id).eq('user_id', m.user_id); if (error) setErr('A casa precisa ter ao menos um administrador.'); else load(); };
  const saveName = async () => { await supabase.from('profiles').update({ display_name: me.trim() }).eq('id', userId!); load(); };
  const leave = async () => { const { error } = await supabase.from('house_members').delete().eq('house_id', house!.id).eq('user_id', userId!); if (error) setErr('Você é o único administrador. Promova outra pessoa antes de sair.'); else refresh(); };

  return (
    <Screen>
      <T variant="title">{house!.name}</T>
      {houses.length > 1 ? <Row style={{ flexWrap: 'wrap' }}>{houses.map((h) => <Chip key={h.id} label={h.name} selected={h.id === house!.id} onPress={() => select(h.id)} />)}</Row> : null}
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Card>
        <T variant="h2">Integrantes</T>
        {members.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }}>{m.display_name}{m.user_id === userId ? ' (você)' : ''}</T>
            <Badge text={m.role === 'admin' ? 'admin' : m.can_edit ? 'edita' : 'só leitura'} tone={m.role === 'admin' ? 'ok' : 'neutral'} />
            {admin && m.user_id !== userId ? (<><Button kind="ghost" title={m.can_edit ? 'Só leitura' : 'Permitir editar'} onPress={() => toggleEdit(m)} /><Button kind="ghost" title="Remover" onPress={() => remove(m)} /></>) : null}
          </Row>
        ))}
        {admin ? (<>
          <Button kind="secondary" title="Criar convite (72 h, até 5 pessoas)" onPress={invite} />
          {code ? <Card><T variant="label">CÓDIGO</T><T variant="title">{code}</T><Button title="Compartilhar" onPress={() => Share.share({ message: `Entre na nossa casa no Meu Mercado Inteligente com o código: ${code}` })} /></Card> : null}
        </>) : null}
      </Card>

      <Card>
        <T variant="h2">Seu perfil</T>
        <Field label="Seu nome" value={me} onChangeText={setMe} />
        <Button kind="secondary" title="Salvar nome" onPress={saveName} disabled={!me.trim()} />
      </Card>

      <Row><Button title="Despensa" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/despensa')} /><Button title="Finanças" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/financas')} /></Row>

      <Card>
        <T variant="h2">Aparência</T>
        <Row style={{ flexWrap: 'wrap' }}>{(['system', 'light', 'dark'] as const).map((m) => <Chip key={m} label={{ system: 'Automático', light: 'Claro', dark: 'Escuro' }[m]} selected={mode === m} onPress={() => setMode(m)} />)}</Row>
      </Card>

      <Button kind="ghost" title="Sair da casa" onPress={leave} />
      <Button kind="danger" title="Sair da conta" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
