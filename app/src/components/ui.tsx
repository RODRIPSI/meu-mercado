import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, TAP, useTheme } from '@/theme';

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const { colors } = useTheme();
  const inner = { padding: pad ? space.lg : 0, gap: space.md };
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? <ScrollView contentContainerStyle={[inner, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
              : <View style={[{ flex: 1 }, inner]}>{children}</View>}
    </SafeAreaView>
  );
}

export function T({ children, variant = 'body', color, style, numberOfLines }: {
  children: React.ReactNode; variant?: 'title' | 'h2' | 'body' | 'small' | 'label'; color?: string; style?: StyleProp<any>; numberOfLines?: number;
}) {
  const { colors } = useTheme();
  const sizes = { title: [26, '700'], h2: [18, '600'], body: [16, '400'], small: [13, '400'], label: [13, '600'] } as const;
  const [fontSize, fontWeight] = sizes[variant];
  return <RNText numberOfLines={numberOfLines} style={[{ fontSize, fontWeight: fontWeight as any, color: color ?? (variant === 'small' ? colors.textMuted : colors.text) }, style]}>{children}</RNText>;
}

export function Button({ title, onPress, kind = 'primary', disabled, loading, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : kind === 'secondary' ? colors.sageSoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? colors.onPrimary : colors.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [{ minHeight: TAP, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</RNText>}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { colors } = useTheme();
  const base: ViewStyle = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: space.lg, gap: space.sm };
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={[base, style]}>{children}</View>;
}

export function Field({ label, containerStyle, ...props }: TextInputProps & { label: string; containerStyle?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ gap: 4 }, props.style && (StyleSheet.flatten(props.style) as any)?.flex ? { flex: (StyleSheet.flatten(props.style) as any).flex } : null, containerStyle]}>
      <T variant="label" color={colors.textMuted}>{label}</T>
      <TextInput placeholderTextColor={colors.textMuted} {...props}
        style={[{ minHeight: TAP, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space.md, fontSize: 16 }, props.multiline && { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' }) {
  const { colors } = useTheme();
  const map = { neutral: [colors.surfaceAlt, colors.textMuted], ok: [colors.sageSoft, colors.ok], warn: [colors.surfaceAlt, colors.warn], danger: [colors.surfaceAlt, colors.danger], accent: [colors.surfaceAlt, colors.accent] } as const;
  const [bg, fg] = map[tone];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}><RNText style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</RNText></View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: selected ? colors.primary : colors.surfaceAlt }}>
      <RNText style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '500' }}>{label}</RNText>
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <View style={{ alignItems: 'center', padding: space.xl, gap: 6 }}><T variant="h2">{title}</T>{hint ? <T variant="small" style={{ textAlign: 'center' }}>{hint}</T> : null}</View>;
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const { colors } = useTheme();
  const c = tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : colors.warn;
  return <View style={{ borderLeftWidth: 4, borderLeftColor: c, backgroundColor: colors.surfaceAlt, padding: space.md, borderRadius: radius.sm }}><RNText style={{ color: colors.text, fontSize: 14 }}>{children}</RNText></View>;
}
