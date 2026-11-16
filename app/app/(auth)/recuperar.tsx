import React, { useState } from 'react';
import * as Linking from 'expo-linking';
import { Button, Field, Notice, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

export default function Recuperar() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: 'danger' | 'ok'; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('nova-senha') });
    setMsg(error ? { tone: 'danger', text: friendlyError(error) } : { tone: 'ok', text: 'Se o e-mail existir, enviamos um link para redefinir a senha.' });
    setBusy(false);
  };
  return (
    <Screen>
      <T variant="title" style={{ marginTop: 32 }}>Recuperar senha</T>
      <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button title="Enviar link" onPress={go} loading={busy} disabled={!email} />
    </Screen>
  );
}
