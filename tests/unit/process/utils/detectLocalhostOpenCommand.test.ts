/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { detectLocalhostOpenCommand } from '@process/agent/utils/detectLocalhostOpenCommand';

describe('detectLocalhostOpenCommand', () => {
  it('matches macOS open with localhost', () => {
    expect(detectLocalhostOpenCommand('open http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('matches xdg-open on Linux', () => {
    expect(detectLocalhostOpenCommand('xdg-open http://localhost:5173/')).toBe('http://localhost:5173/');
  });

  it('matches Windows start', () => {
    expect(detectLocalhostOpenCommand('start http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('matches 127.0.0.1', () => {
    expect(detectLocalhostOpenCommand('open http://127.0.0.1:4000/path')).toBe('http://127.0.0.1:4000/path');
  });

  it('matches in a compound command', () => {
    expect(detectLocalhostOpenCommand('npm run dev & sleep 2 && open http://localhost:3000')).toBe(
      'http://localhost:3000'
    );
  });

  it('handles quoted URLs', () => {
    expect(detectLocalhostOpenCommand('open "http://localhost:3000/foo bar"')).toBe('http://localhost:3000/foo');
  });

  it('returns null for non-localhost URLs', () => {
    expect(detectLocalhostOpenCommand('open https://example.com')).toBeNull();
  });

  it('returns null when no open-style command is present', () => {
    expect(detectLocalhostOpenCommand('curl http://localhost:3000')).toBeNull();
    expect(detectLocalhostOpenCommand('npm run dev')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(detectLocalhostOpenCommand('')).toBeNull();
    expect(detectLocalhostOpenCommand(undefined)).toBeNull();
    expect(detectLocalhostOpenCommand(null)).toBeNull();
  });

  it('does not match `open` substring inside another word', () => {
    expect(detectLocalhostOpenCommand('reopen http://localhost:3000')).toBeNull();
  });

  it('matches bash -c wrapper with quoted command', () => {
    expect(detectLocalhostOpenCommand(`bash -c "open http://localhost:3000"`)).toBe('http://localhost:3000');
    expect(detectLocalhostOpenCommand(`sh -c 'xdg-open http://localhost:5173'`)).toBe('http://localhost:5173');
  });

  it('matches macOS open with -a application flag', () => {
    expect(detectLocalhostOpenCommand(`open -a "Google Chrome" http://localhost:3000`)).toBe('http://localhost:3000');
    expect(detectLocalhostOpenCommand(`open -na 'Safari' http://localhost:8080/foo`)).toBe('http://localhost:8080/foo');
  });

  it('matches with nohup / & backgrounding', () => {
    expect(detectLocalhostOpenCommand('nohup open http://localhost:3000 &')).toBe('http://localhost:3000');
  });

  it('matches with PORT prefix and dev server chain', () => {
    expect(detectLocalhostOpenCommand('PORT=3000 npm run dev & sleep 3 && open http://localhost:3000')).toBe(
      'http://localhost:3000'
    );
  });
});
