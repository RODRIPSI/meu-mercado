import React, { useState } from 'react';
import { Button, Field, Notice, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

export default function Cadastro() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: 'danger' | 'ok'; text: string } | null>(null);
  const weak = password.length < 8;
  const go = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
    if (error) setMsg({ tone: 'danger', text: friendlyError(error) });
    else if (!data.session) setMsg({ tone: 'ok', text: 'Conta criada. Confirme seu e-mail para entrar.' });
    setBusy(false);
  };
  return (
    <Screen>
      <T variant="title" style={{ marginTop: 32 }}>Criar conta</T>
      <Field label="Seu nome" value={name} onChangeText={setName} />
      <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Senha (mínimo 8 caracteres)" value={password} onChangeText={setPassword} secureTextEntry />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button title="Cadastrar" onPress={go} loading={busy} disabled={!name.trim() || !email || weak} />
    </Screen>
  );
}
