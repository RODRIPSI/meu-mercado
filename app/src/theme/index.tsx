import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const palette = {
  light: {
    bg: '#FAF7F0',            // marfim
    surface: '#FFFFFF',
    surfaceAlt: '#F0EEE7',    // cinza suave
    border: '#E2DFD6',
    text: '#1F2B24',
    textMuted: '#667267',
    primary: '#2F4A3A',       // verde-escuro
    onPrimary: '#FFFFFF',
    sage: '#9CAF88',          // verde-sálvia
    sageSoft: '#E4EBDD',
    accent: '#C8704A',        // destaque (promoções) — uso moderado
    danger: '#B3402F',
    warn: '#A9791C',
    ok: '#3C7A4F',
  },
  dark: {
    bg: '#121A15',
    surface: '#1B2620',
    surfaceAlt: '#24312A',
    border: '#2F3E35',
    text: '#EDF1EA',
    textMuted: '#9AA79D',
    primary: '#9CAF88',
    onPrimary: '#10231A',
    sage: '#6F8A5E',
    sageSoft: '#26352C',
    accent: '#E39068',
    danger: '#E0806F',
    warn: '#D8A94A',
    ok: '#7FC293',
  },
};
export type Colors = typeof palette.light;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 14, lg: 20 };
export const TAP = 52; // alvo de toque mínimo confortável no supermercado

type Mode = 'system' | 'light' | 'dark';
const Ctx = createContext<{ colors: Colors; dark: boolean; mode: Mode; setMode: (m: Mode) => void }>(null as never);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');
  useEffect(() => { AsyncStorage.getItem('theme-mode').then((v) => v && setModeState(v as Mode)); }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('theme-mode', m); };
  const dark = mode === 'system' ? sys === 'dark' : mode === 'dark';
  const value = useMemo(() => ({ colors: dark ? palette.dark : palette.light, dark, mode, setMode }), [dark, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
