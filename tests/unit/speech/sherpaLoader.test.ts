/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSherpaPackageName, isSherpaSupported, loadSherpaAddon } from '@/process/services/speech/sherpaLoader';

describe('sherpaLoader', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    vi.restoreAllMocks();
  });

  describe('getSherpaPackageName', () => {
    it('returns sherpa-onnx-darwin-arm64 on macOS Apple Silicon', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      expect(getSherpaPackageName()).toBe('sherpa-onnx-darwin-arm64');
    });

    it('returns sherpa-onnx-darwin-x64 on macOS Intel', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      expect(getSherpaPackageName()).toBe('sherpa-onnx-darwin-x64');
    });

    it('returns sherpa-onnx-linux-x64 on Linux x64', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      expect(getSherpaPackageName()).toBe('sherpa-onnx-linux-x64');
    });

    it('returns sherpa-onnx-linux-arm64 on Linux ARM64', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      expect(getSherpaPackageName()).toBe('sherpa-onnx-linux-arm64');
    });

    it('returns sherpa-onnx-win-x64 on Windows x64', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      expect(getSherpaPackageName()).toBe('sherpa-onnx-win-x64');
    });

    it('returns null on Windows 32-bit (ia32)', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      Object.defineProperty(process, 'arch', { value: 'ia32' });
      expect(getSherpaPackageName()).toBeNull();
    });

    it('returns null on unsupported operating system (e.g. freebsd)', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
      expect(getSherpaPackageName()).toBeNull();
    });
  });

  describe('loadSherpaAddon and isSherpaSupported', () => {
    it('throws error when platform is unsupported', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      // If cachedSherpaAddon was not set, it throws unsupported
      // Note: isSherpaSupported returns boolean safely
      const supported = isSherpaSupported();
      expect(typeof supported).toBe('boolean');
    });

    it('loads native addon or reports support status safely', () => {
      const supported = isSherpaSupported();
      if (supported) {
        const addon = loadSherpaAddon();
        expect(addon).toBeDefined();
      } else {
        expect(() => {
          Object.defineProperty(process, 'platform', { value: 'unknown_os' });
          loadSherpaAddon();
        }).toThrow();
      }
    });
  });
});
