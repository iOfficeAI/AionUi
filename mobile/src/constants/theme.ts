import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#687076',
    background: '#fff',
    surface: '#F5F5F5',
    border: '#E5E5E5',
    tint: '#165DFF',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#165DFF',
    error: '#F53F3F',
    success: '#00B42A',
    warning: '#FF7D00',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#151718',
    surface: '#1E2022',
    border: '#2E3234',
    tint: '#3C7EFF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#3C7EFF',
    error: '#F76560',
    success: '#27C346',
    warning: '#FF9A2E',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui' as const,
    mono: 'ui-monospace' as const,
  },
  default: {
    sans: 'normal' as const,
    mono: 'monospace' as const,
  },
});
