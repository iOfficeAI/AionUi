import type { ThemePack } from './types';

export const PRESET_GITHUB_LIGHT: ThemePack = {
  id: 'github-light',
  name: 'GitHub Light',
  defaultMode: 'light', // GitHub Light 默认明亮模式
  light: {
    variables: {
      '--color-bg-1': '#ffffff',
      '--color-text-1': '#24292e',
      '--color-border-1': '#e1e4e8',
      '--color-fill-1': '#f6f8fa',
    },
    arco: { primaryColor: '#0969DA' },
  },
  dark: {
    variables: {
      '--color-bg-1': '#0d1117',
      '--color-text-1': '#c9d1d9',
      '--color-border-1': '#30363d',
      '--color-fill-1': '#161b22',
    },
    arco: { primaryColor: '#2F81F7' },
  },
};

export const PRESET_VSCODE: ThemePack = {
  id: 'vscode',
  name: 'VS Code',
  defaultMode: 'dark', // VS Code 默认暗黑模式
  light: {
    variables: {
      '--color-bg-1': '#ffffff',
      '--color-text-1': '#1e1e1e',
      '--color-border-1': '#e5e5e5',
      '--color-fill-1': '#f3f3f3',
    },
    arco: { primaryColor: '#007ACC' },
  },
  dark: {
    variables: {
      '--color-bg-1': '#1e1e1e',
      '--color-text-1': '#d4d4d4',
      '--color-border-1': '#2e2e2e',
      '--color-fill-1': '#252526',
    },
    arco: { primaryColor: '#3794FF' },
  },
};

export const BUILTIN_PRESETS: ThemePack[] = [PRESET_GITHUB_LIGHT, PRESET_VSCODE];
