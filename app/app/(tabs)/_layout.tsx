import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: any; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false,
      tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 12 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Listas', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="precos" options={{ title: 'Preços', tabBarIcon: icon('pricetags') }} />
      <Tabs.Screen name="mercados" options={{ title: 'Mercados', tabBarIcon: icon('storefront') }} />
      <Tabs.Screen name="casa" options={{ title: 'Casa', tabBarIcon: icon('home') }} />
    </Tabs>
  );
}
