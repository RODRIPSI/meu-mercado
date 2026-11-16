import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth';
import { useHouse } from '@/features/house';

/** Porta de entrada: decide o destino conforme o estado (sem sessão, recuperando senha, sem casa, ou pronto). */
export default function Entrada() {
  const { session, recovering } = useAuth(); const { house } = useHouse();
  if (!session) return <Redirect href="/login" />;
  if (recovering) return <Redirect href="/nova-senha" />;
  if (!house) return <Redirect href="/onboarding" />;
  return <Redirect href="/listas" />;
}
