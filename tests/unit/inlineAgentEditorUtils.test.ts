import { describe, it, expect, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => ({
  Alert: vi.fn(),
  Button: vi.fn(),
  Collapse: Object.assign(vi.fn(), { Item: vi.fn() }),
  Input: vi.fn(),
  Space: vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Plus: vi.fn(),
  Delete: vi.fn(),
  CheckOne: vi.fn(),
  CloseOne: vi.fn(),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: vi.fn(),
}));

vi.mock('@codemirror/lang-json', () => ({
  json: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'test-uuid'),
}));

import {
  parseArgsString,
  envVarsToObject,
  objectToEnvVars,
} from '@/renderer/pages/settings/AgentSettings/InlineAgentEditor';

describe('parseArgsString', () => {
  it('empty string returns empty array', () => {
    expect(parseArgsString('')).toEqual([]);
  });

  it('simple space-separated args', () => {
    expect(parseArgsString('--acp --verbose')).toEqual(['--acp', '--verbose']);
  });

  it('double-quoted string kept as single arg', () => {
    expect(parseArgsString('--name "hello world" --flag')).toEqual(['--name', 'hello world', '--flag']);
  });

  it('single-quoted string kept as single arg', () => {
    expect(parseArgsString("--name 'hello world' --flag")).toEqual(['--name', 'hello world', '--flag']);
  });

  it('mixed quotes', () => {
    expect(parseArgsString('"first arg" \'second arg\' third')).toEqual(['first arg', 'second arg', 'third']);
  });

  it('multiple consecutive spaces collapse into single separator', () => {
    expect(parseArgsString('a   b   c')).toEqual(['a', 'b', 'c']);
  });

  it('leading and trailing spaces are ignored', () => {
    expect(parseArgsString('  foo bar  ')).toEqual(['foo', 'bar']);
  });

  it('unclosed quote — content still captured', () => {
    expect(parseArgsString('"unclosed')).toEqual(['unclosed']);
  });
});

describe('envVarsToObject', () => {
  it('empty array returns empty object', () => {
    expect(envVarsToObject([])).toEqual({});
  });

  it('converts array to key/value object', () => {
    expect(
      envVarsToObject([
        { id: '1', key: 'FOO', value: 'bar' },
        { id: '2', key: 'BAZ', value: 'qux' },
      ])
    ).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('trims whitespace from keys', () => {
    expect(envVarsToObject([{ id: '1', key: '  KEY  ', value: 'val' }])).toEqual({ KEY: 'val' });
  });

  it('skips entries with empty key', () => {
    expect(envVarsToObject([{ id: '1', key: '', value: 'val' }])).toEqual({});
  });

  it('skips entries with whitespace-only key', () => {
    expect(envVarsToObject([{ id: '1', key: '   ', value: 'val' }])).toEqual({});
  });

  it('last value wins for duplicate keys', () => {
    expect(
      envVarsToObject([
        { id: '1', key: 'KEY', value: 'first' },
        { id: '2', key: 'KEY', value: 'second' },
      ])
    ).toEqual({ KEY: 'second' });
  });
});

describe('objectToEnvVars', () => {
  it('undefined returns empty array', () => {
    expect(objectToEnvVars(undefined)).toEqual([]);
  });

  it('empty object returns empty array', () => {
    expect(objectToEnvVars({})).toEqual([]);
  });

  it('single entry maps to EnvVar with uuid id', () => {
    expect(objectToEnvVars({ KEY: 'val' })).toEqual([{ id: 'test-uuid', key: 'KEY', value: 'val' }]);
  });

  it('multiple entries preserve insertion order', () => {
    expect(objectToEnvVars({ A: '1', B: '2', C: '3' })).toEqual([
      { id: 'test-uuid', key: 'A', value: '1' },
      { id: 'test-uuid', key: 'B', value: '2' },
      { id: 'test-uuid', key: 'C', value: '3' },
    ]);
  });
});
