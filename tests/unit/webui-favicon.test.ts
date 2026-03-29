import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

describe('WebUI favicon', () => {
  it('index.html favicon href resolves to a file inside the public directory', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');

    // Extract the favicon href
    const match = html.match(/<link\s+rel="icon"[^>]+href="([^"]+)"/);
    expect(match).not.toBeNull();

    const href = match![1];

    // The href must be a relative path starting with ./ so it resolves
    // correctly in both Electron (file://) and WebUI (Express static serving).
    // Paths like ../../resources/ escape the served directory in WebUI mode.
    expect(href).toMatch(/^\.\//);
    expect(href).not.toContain('..');

    // The referenced file must exist in the public/ directory (Vite copies
    // public/ contents to the build output root, so ./foo maps to public/foo).
    const relPath = href.replace(/^\.\//, '');
    const publicFile = path.join(ROOT, 'public', relPath);
    expect(fs.existsSync(publicFile)).toBe(true);
  });
});
