/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression + behavior suite for copyText (issue #4306).
 *
 * The riskiest scenario: in a secure context the modern Clipboard API can still
 * reject (sandboxed iframe without clipboard-write, enterprise policy, unfocused
 * document → NotAllowedError). The utility must fall back to execCommand instead
 * of letting the rejection surface as "复制失败".
 */
describe('copyText', () => {
  let copyText: (text: string) => Promise<void>;
  let writeTextMock: ReturnType<typeof vi.fn>;
  let execCommandMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const setSecureContext = (secure: boolean) => {
    Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  };

  const setClipboard = (clipboard: unknown) => {
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  };

  beforeEach(async () => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    execCommandMock = vi.fn().mockReturnValue(true);

    setSecureContext(true);
    setClipboard({ writeText: writeTextMock });
    Object.defineProperty(document, 'execCommand', { value: execCommandMock, configurable: true, writable: true });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reimport to mirror the project's DOM-test convention.
    const module = await import('@/renderer/utils/ui/clipboard');
    copyText = module.copyText;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'activeElement', { value: document.body, configurable: true });
  });

  describe('secure context with a working Clipboard API', () => {
    it('writes through the modern API and never touches the execCommand fallback', async () => {
      await expect(copyText('hello')).resolves.toBeUndefined();

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(execCommandMock).not.toHaveBeenCalled();
    });

    it('leaves no temporary textarea behind on the happy path', async () => {
      await copyText('hello');

      expect(document.body.querySelector('textarea')).toBeNull();
    });
  });

  describe('secure context where the Clipboard API rejects', () => {
    it('falls back to execCommand and resolves instead of rejecting', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));

      await expect(copyText('from-reject')).resolves.toBeUndefined();

      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });

    it('logs the failure without leaking the copied text', async () => {
      const secret = 'super-secret-clipboard-value-123';
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));

      await copyText(secret);

      const leakedSecret = warnSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes(secret))
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(leakedSecret).toBe(false);
    });

    it('rejects with the execCommand error when the fallback reports failure', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));
      execCommandMock.mockReturnValue(false);

      await expect(copyText('x')).rejects.toThrow('execCommand copy returned false');
    });

    it('propagates the fallback error when execCommand itself throws', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));
      execCommandMock.mockImplementation(() => {
        throw new Error('exec-threw');
      });

      await expect(copyText('x')).rejects.toThrow('exec-threw');
    });

    it('removes the temporary textarea after a successful fallback', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      await copyText('x');

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('textarea')).toBeNull();
    });

    it('removes the temporary textarea even when the fallback fails', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));
      execCommandMock.mockReturnValue(false);

      await expect(copyText('x')).rejects.toThrow();

      expect(document.body.querySelector('textarea')).toBeNull();
    });

    it('restores focus to the previously focused element', async () => {
      writeTextMock.mockRejectedValue(new Error('clipboard denied'));
      const previous = document.createElement('button');
      document.body.appendChild(previous);
      Object.defineProperty(document, 'activeElement', { value: previous, configurable: true });
      const focusSpy = vi.spyOn(previous, 'focus');

      await copyText('x');

      expect(focusSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-secure context', () => {
    it('uses the execCommand fallback directly', async () => {
      setSecureContext(false);
      setClipboard(undefined);

      await expect(copyText('http-copy')).resolves.toBeUndefined();

      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });
  });
});
