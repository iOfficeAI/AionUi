import { Text, type TextProps, StyleSheet } from 'react-native';
import { useThemeColor } from '../../hooks/useThemeColor';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'subtitle' | 'caption' | 'link';
};

export function ThemedText({ style, lightColor, darkColor, type = 'default', ...rest }: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const tint = useThemeColor({}, 'tint');

  return <Text style={[{ color }, styles[type], type === 'link' && { color: tint }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
  },
});
