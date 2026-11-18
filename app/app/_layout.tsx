import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/theme';
import { AuthProvider, useAuth } from '@/features/auth';
import { HouseProvider, useHouse } from '@/features/house';
import { CatalogProvider } from '@/features/catalog';
import { Platform } from 'react-native';
import { isConfigured, saveWebConfig } from '@/lib/supabase';
import { validateConfig } from '@/lib/config';
import { Button, Field, Notice, Screen, T } from '@/components/ui';

function Gate() {
  const { colors, dark } = useTheme();
  const { session, loading, recovering } = useAuth();
  const { house, loading: hl } = useHouse();
  if (loading || (session && hl)) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}><ActivityIndicator color={colors.primary} /></View>;
  const opts = { headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.bg } };
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={opts}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && recovering}>
          <Stack.Screen name="nova-senha" options={{ title: 'Nova senha' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !recovering && !house}>
          <Stack.Screen name="onboarding" options={{ title: 'Sua casa' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !recovering && !!house}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lista/[id]" options={{ title: 'Lista' }} />
          <Stack.Screen name="otimizar/[id]" options={{ title: 'Otimizar compra' }} />
          <Stack.Screen name="compra/[id]" options={{ title: 'Modo compra' }} />
          <Stack.Screen name="produto/[id]" options={{ title: 'Produto' }} />
          <Stack.Screen name="produto/novo" options={{ title: 'Novo produto', presentation: 'modal' }} />
          <Stack.Screen name="preco/novo" options={{ title: 'Registrar preço', presentation: 'modal' }} />
          <Stack.Screen name="mercado-novo" options={{ title: 'Nova filial', presentation: 'modal' }} />
          <Stack.Screen name="importar" options={{ title: 'Importar preços' }} />
          <Stack.Screen name="scanner" options={{ title: 'Ler código de barras', presentation: 'modal' }} />
          <Stack.Screen name="despensa" options={{ title: 'Despensa' }} />
          <Stack.Screen name="financas" options={{ title: 'Finanças' }} />
          <Stack.Screen name="importar-lista" options={{ title: 'Importar lista' }} />
          <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
          <Stack.Screen name="revisar-ofertas" options={{ title: 'Revisar ofertas' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function SetupWeb() {
  const [url, setUrl] = React.useState(''); const [key, setKey] = React.useState('');
  const err = url || key ? validateConfig(url, key) : null;
  return (
    <Screen>
      <T variant="title" style={{ marginTop: 32 }}>Conectar ao seu banco</T>
      <T variant="small">Cole uma única vez os dados do seu projeto Supabase (Project Settings → API). Ficam guardados só neste aparelho.</T>
      <Field label="Project URL" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://xxxx.supabase.co" />
      <Field label="Chave anon public" value={key} onChangeText={setKey} autoCapitalize="none" />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title="Salvar e abrir" disabled={!url || !key || !!err} onPress={() => saveWebConfig(url, key)} />
    </Screen>
  );
}

export default function Root() {
  if (!isConfigured) {
    return (
      <ThemeProvider>
        {Platform.OS === 'web' ? <SetupWeb /> : (
          <Screen>
            <T variant="title">Configuração pendente</T>
            <Notice tone="danger">Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env (veja docs/ANDROID.md) e reinicie o app.</Notice>
          </Screen>
        )}
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider>
      <AuthProvider>
        <HouseProvider>
          <CatalogProvider>
            <Gate />
          </CatalogProvider>
        </HouseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
