import React, { useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Notice, Screen, T } from '@/components/ui';
import { emitScan } from '@/lib/scanBus';

export default function Scanner() {
  const router = useRouter(); const [perm, ask] = useCameraPermissions(); const done = useRef(false);
  if (!perm) return <Screen><T>Verificando permissão…</T></Screen>;
  if (!perm.granted) return (
    <Screen>
      <Notice>Precisamos da câmera para ler códigos de barras.</Notice>
      <Button title="Permitir câmera" onPress={ask} />
    </Screen>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={({ data }) => { if (done.current) return; done.current = true; emitScan(data); router.back(); }} />
      <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}><T color="#fff">Aponte para o código de barras</T></View>
    </View>
  );
}
