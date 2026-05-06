import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const rendererDir = path.resolve(__dirname, '../../src/renderer');

describe('NovaMaster default theme wiring', () => {
  it('boots the renderer in dark mode before React loads', () => {
    const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf-8');

    expect(html).toContain('<html data-theme="dark" data-color-scheme="default">');
    expect(html).toContain("theme = 'dark'");
    expect(html).toContain("t = 'dark'");
  });

  it('falls back to dark mode when persisted theme storage is invalid or legacy auto', () => {
    const useThemeSource = fs.readFileSync(path.join(rendererDir, 'hooks/system/useTheme.ts'), 'utf-8');

    expect(useThemeSource).toContain("const DEFAULT_THEME: Theme = 'dark';");
    expect(useThemeSource).toContain("theme === 'light' || theme === 'dark' ? theme : DEFAULT_THEME");
  });
});
