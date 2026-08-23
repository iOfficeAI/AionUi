import { describe, expect, it } from 'vitest';
import {
  relativizePath,
  truncate,
  buildLineRangeLabel,
  diffCountLabel,
  prettifyToolName,
  classifyBashCommand,
  getToolIconKey,
} from './toolBlockPresentation';

describe('relativizePath', () => {
  it('strips the workspace prefix', () => {
    expect(relativizePath('/ws/src/a.ts', '/ws')).toBe('src/a.ts');
    expect(relativizePath('/ws/src/a.ts', '/ws/')).toBe('src/a.ts');
  });
  it('returns the basename-relative form when outside workspace', () => {
    expect(relativizePath('/other/x.ts', '/ws')).toBe('x.ts');
  });
  it('handles empty input', () => {
    expect(relativizePath(undefined, '/ws')).toBeUndefined();
  });
});

describe('truncate', () => {
  it('truncates long text with ellipsis at word-safe length', () => {
    expect(truncate('a'.repeat(80), 60)).toHaveLength(63);
    expect(truncate('short', 60)).toBe('short');
    expect(truncate(undefined, 60)).toBeUndefined();
  });
});

describe('buildLineRangeLabel', () => {
  it('formats L ranges', () => {
    expect(buildLineRangeLabel(12, 30)).toBe('L12-30');
    expect(buildLineRangeLabel(12, 12)).toBe('L12');
    expect(buildLineRangeLabel(undefined, 30)).toBeUndefined();
  });
});

describe('diffCountLabel', () => {
  it('formats +N/-M pills', () => {
    expect(diffCountLabel({ added: 12, removed: 3 })).toEqual({ added: '+12', removed: '-3' });
    expect(diffCountLabel({ added: 0, removed: 0 })).toBeUndefined();
    expect(diffCountLabel(undefined)).toBeUndefined();
  });
});

describe('prettifyToolName', () => {
  it('splits snake_case into capitalized words (ignoring empty MCP segments)', () => {
    expect(prettifyToolName('mcp__serena_search')).toBe('Mcp Serena Search');
    expect(prettifyToolName('read_file')).toBe('Read File');
  });
  it('splits CamelCase at capital boundaries', () => {
    expect(prettifyToolName('WebSearch')).toBe('Web Search');
    expect(prettifyToolName('SomeMcpTool')).toBe('Some Mcp Tool');
  });
  it('keeps natural-language ACP titles as-is', () => {
    expect(prettifyToolName('查看主进程各模块文件')).toBe('查看主进程各模块文件');
    expect(prettifyToolName('docker')).toBe('docker');
  });
});

describe('classifyBashCommand', () => {
  it('classifies read commands and extracts the path', () => {
    expect(classifyBashCommand('cat -n src/main.ts')).toEqual({ kind: 'read', path: 'src/main.ts' });
    expect(classifyBashCommand("sed -n '1,10p' a.ts")).toEqual({ kind: 'read', path: 'a.ts' });
    expect(classifyBashCommand('head -20 log.txt')).toEqual({ kind: 'read', path: 'log.txt' });
  });
  it('classifies list and search commands', () => {
    expect(classifyBashCommand('ls packages')).toEqual({ kind: 'list', path: 'packages' });
    expect(classifyBashCommand('git ls-files packages')).toEqual({ kind: 'list', path: 'packages' });
    expect(classifyBashCommand('rg foo')).toEqual({ kind: 'search' });
  });
  it('falls back to run for everything else', () => {
    expect(classifyBashCommand('cargo build')).toEqual({ kind: 'run' });
    expect(classifyBashCommand(undefined)).toEqual({ kind: 'run' });
  });
  it('unwraps /bin/zsh -lc command wrappers', () => {
    expect(classifyBashCommand("/bin/zsh -lc 'cat a.ts'")).toEqual({ kind: 'read', path: 'a.ts' });
  });
});

describe('getToolIconKey', () => {
  it('maps tool names to per-tool icons like the reference design', () => {
    expect(getToolIconKey('Read')).toBe('read');
    expect(getToolIconKey('Edit')).toBe('edit');
    expect(getToolIconKey('Write')).toBe('write');
    expect(getToolIconKey('Glob')).toBe('glob');
    expect(getToolIconKey('WebFetch')).toBe('web');
    expect(getToolIconKey('WebSearch')).toBe('search');
    expect(getToolIconKey('delete')).toBe('delete');
    expect(getToolIconKey('TodoWrite')).toBe('plan');
    expect(getToolIconKey('Task')).toBe('task');
    expect(getToolIconKey('Bash')).toBe('bash');
  });

  it('refines command tools by what the command does (when a command is given)', () => {
    expect(getToolIconKey('execute_command', 'cat a.ts')).toBe('read');
    expect(getToolIconKey('execute_command', 'ls packages')).toBe('glob');
    expect(getToolIconKey('execute_command', 'rg foo')).toBe('search');
    expect(getToolIconKey('execute_command', 'cargo build')).toBe('bash');
  });

  it('keeps the dedicated bash icon fixed when no command is passed', () => {
    expect(getToolIconKey('Bash')).toBe('bash');
  });

  it('falls back to generic', () => {
    expect(getToolIconKey('SomeMcpTool')).toBe('generic');
    expect(getToolIconKey(undefined)).toBe('generic');
  });
});
