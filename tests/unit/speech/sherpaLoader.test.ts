/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getSherpaPackageName, isSherpaSupported, loadSherpaAddon } from '@/process/services/speech/sherpaLoader';

describe('sherpaLoader', () => {
  it('returns expected package name based on platform and architecture', () => {
    const pkg = getSherpaPackageName();
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(pkg).toBe('sherpa-onnx-darwin-arm64');
    } else if (process.platform === 'darwin' && process.arch === 'x64') {
      expect(pkg).toBe('sherpa-onnx-darwin-x64');
    } else if (process.platform === 'linux' && process.arch === 'x64') {
      expect(pkg).toBe('sherpa-onnx-linux-x64');
    } else if (process.platform === 'win32' && process.arch === 'x64') {
      expect(pkg).toBe('sherpa-onnx-win-x64');
    }
  });

  it('loads sherpa addon on supported platform without error', () => {
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(isSherpaSupported()).toBe(true);
      const addon = loadSherpaAddon();
      expect(addon).toBeDefined();
      expect(typeof addon.createOfflineRecognizer).toBe('function');
      expect(typeof addon.createOfflineStream).toBe('function');
      expect(typeof addon.readWaveFromBinary).toBe('function');
    }
  });
});
