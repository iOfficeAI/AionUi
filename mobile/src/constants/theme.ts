import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#3c3836',
    textSecondary: '#504945',
    background: '#fbf1c7',
    surface: '#f2e5bc',
    border: '#d5c4a1',
    tint: '#076678',
    icon: '#928374',
    tabIconDefault: '#928374',
    tabIconSelected: '#076678',
    error: '#9d0006',
    success: '#79740e',
    warning: '#b57614',
    codeBackground: '#ebdbb2',
    codeForeground: '#9d0006',
    tipErrorBg: '#f2e5bc',
    tipWarningBg: '#f2e5bc',
    tipSuccessBg: '#f2e5bc',
    confirmBg: '#f2e5bc',
    confirmBorder: '#b57614',
    purple: '#8f3f71',
  },
  dark: {
    text: '#ebdbb2',
    textSecondary: '#d5c4a1',
    background: '#282828',
    surface: '#3c3836',
    border: '#665c54',
    tint: '#83a598',
    icon: '#928374',
    tabIconDefault: '#928374',
    tabIconSelected: '#83a598',
    error: '#fb4934',
    success: '#b8bb26',
    warning: '#fabd2f',
    codeBackground: '#3c3836',
    codeForeground: '#fb4934',
    tipErrorBg: '#3c3836',
    tipWarningBg: '#3c3836',
    tipSuccessBg: '#3c3836',
    confirmBg: '#3c3836',
    confirmBorder: '#fabd2f',
    purple: '#d3869b',
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
