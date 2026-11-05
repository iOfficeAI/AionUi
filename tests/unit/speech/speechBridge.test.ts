/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const speechMocks = vi.hoisted(() => ({
  isModelReady: vi.fn(),
  getModelStatus: vi.fn(),
  downloadModel: vi.fn(),
  cancelModelDownload: vi.fn(),
  transcribeLocalAudio: vi.fn(),
}));

vi.mock('@/process/services/speech', () => ({
  isModelReady: speechMocks.isModelReady,
  getModelStatus: speechMocks.getModelStatus,
  downloadModel: speechMocks.downloadModel,
  cancelModelDownload: speechMocks.cancelModelDownload,
  transcribeLocalAudio: speechMocks.transcribeLocalAudio,
}));

const mockProviders: Record<string, Function> = {};
const mockEmit = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    speech: {
      checkModel: {
        provider: (fn: Function) => {
          mockProviders.checkModel = fn;
        },
      },
      downloadModel: {
        provider: (fn: Function) => {
          mockProviders.downloadModel = fn;
        },
      },
      cancelDownload: {
        provider: (fn: Function) => {
          mockProviders.cancelDownload = fn;
        },
      },
      transcribe: {
        provider: (fn: Function) => {
          mockProviders.transcribe = fn;
        },
      },
      onDownloadProgress: {
        emit: (...args: any[]) => mockEmit(...args),
      },
    },
  },
}));

import { initSpeechBridge } from '@/process/bridge/speechBridge';

describe('speechBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initSpeechBridge();
  });

  it('registers all IPC providers', () => {
    expect(mockProviders.checkModel).toBeDefined();
    expect(mockProviders.downloadModel).toBeDefined();
    expect(mockProviders.cancelDownload).toBeDefined();
    expect(mockProviders.transcribe).toBeDefined();
  });

  it('handles checkModel provider call', async () => {
    speechMocks.isModelReady.mockResolvedValueOnce(true);
    speechMocks.getModelStatus.mockReturnValueOnce({
      modelId: 'parakeet-tdt-0.6b-v3-int8',
      status: 'ready',
      progress: 100,
      downloadedBytes: 100,
      totalBytes: 100,
    });

    const res = await mockProviders.checkModel({ modelId: 'parakeet-tdt-0.6b-v3-int8' });
    expect(res.isReady).toBe(true);
    expect(res.status.status).toBe('ready');
    expect(speechMocks.isModelReady).toHaveBeenCalledWith('parakeet-tdt-0.6b-v3-int8');
    expect(speechMocks.getModelStatus).toHaveBeenCalledWith('parakeet-tdt-0.6b-v3-int8');
  });

  it('handles downloadModel provider call and emits progress', async () => {
    speechMocks.downloadModel.mockImplementation(async (modelId, onProgress) => {
      onProgress({ modelId, percent: 50, downloadedBytes: 50, totalBytes: 100 });
      return { modelId, status: 'ready', progress: 100, downloadedBytes: 100, totalBytes: 100 };
    });

    const res = await mockProviders.downloadModel({ modelId: 'parakeet-tdt-0.6b-v3-int8' });
    expect(res.status).toBe('ready');
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        percent: 50,
      })
    );
  });

  it('handles cancelDownload provider call', () => {
    speechMocks.cancelModelDownload.mockReturnValueOnce(true);
    const res = mockProviders.cancelDownload({ modelId: 'parakeet-tdt-0.6b-v3-int8' });
    expect(res).toBe(true);
    expect(speechMocks.cancelModelDownload).toHaveBeenCalledWith('parakeet-tdt-0.6b-v3-int8');
  });

  it('handles transcribe provider call with Uint8Array and array-like buffer', async () => {
    speechMocks.transcribeLocalAudio.mockResolvedValueOnce({
      model: 'parakeet-tdt-0.6b-v3-int8',
      provider: 'local',
      text: 'Transcribed text',
    });

    const res = await mockProviders.transcribe({
      audioBuffer: [1, 2, 3],
      modelId: 'parakeet-tdt-0.6b-v3-int8',
    });
    expect(res.text).toBe('Transcribed text');
    expect(speechMocks.transcribeLocalAudio).toHaveBeenCalledWith(expect.any(Uint8Array), 'parakeet-tdt-0.6b-v3-int8');
  });
});
