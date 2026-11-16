import React, { useState } from 'react';
import { Link } from 'expo-router';
import { Button, Field, Notice, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(friendlyError(error));
    setBusy(false);
  };
  return (
    <Screen>
      <T variant="title" style={{ marginTop: 48 }}>Meu Mercado Inteligente</T>
      <T variant="small">Compras da casa, juntas e mais baratas.</T>
      <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title="Entrar" onPress={go} loading={busy} disabled={!email || !password} />
      <Link href="/cadastro" asChild><Button title="Criar conta" kind="secondary" onPress={() => {}} /></Link>
      <Link href="/recuperar" asChild><Button title="Esqueci minha senha" kind="ghost" onPress={() => {}} /></Link>
    </Screen>
  );
}
