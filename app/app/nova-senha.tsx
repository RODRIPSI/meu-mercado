import React, { useState } from 'react';
import { Button, Field, Notice, Screen, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

export default function NovaSenha() {
  const { clearRecovery } = useAuth();
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(friendlyError(error)); else clearRecovery();
    setBusy(false);
  };
  return (
    <Screen>
      <T variant="h2">Defina sua nova senha</T>
      <Field label="Nova senha (mínimo 8 caracteres)" value={pw} onChangeText={setPw} secureTextEntry />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title="Salvar senha" onPress={go} loading={busy} disabled={pw.length < 8} />
    </Screen>
  );
}
