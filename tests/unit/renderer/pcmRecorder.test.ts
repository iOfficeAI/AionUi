/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  STREAM_CHUNK_SAMPLES,
  STREAM_SAMPLE_RATE,
  encodeWavPcm16,
  floatTo16BitPcm,
  resampleLinear,
} from '@renderer/services/speech/pcmRecorder';

describe('constants', () => {
  it('exposes the 24kHz streaming rate and 200ms chunk size', () => {
    expect(STREAM_SAMPLE_RATE).toBe(24000);
    expect(STREAM_CHUNK_SAMPLES).toBe(4800);
  });
});

describe('floatTo16BitPcm', () => {
  it('maps 0 to 0', () => {
    expect(floatTo16BitPcm(new Float32Array([0]))[0]).toBe(0);
  });

  it('maps 1 to 32767 and -1 to -32768', () => {
    const out = floatTo16BitPcm(new Float32Array([1, -1]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  it('maps 0.5 to approximately 16383', () => {
    const out = floatTo16BitPcm(new Float32Array([0.5]));
    expect(Math.abs(out[0] - 16383)).toBeLessThanOrEqual(1);
  });

  it('maps -0.5 to approximately -16384', () => {
    const out = floatTo16BitPcm(new Float32Array([-0.5]));
    expect(Math.abs(out[0] - -16384)).toBeLessThanOrEqual(1);
  });

  it('clamps out-of-range samples', () => {
    const out = floatTo16BitPcm(new Float32Array([2, -2]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  it('preserves length', () => {
    expect(floatTo16BitPcm(new Float32Array(128)).length).toBe(128);
  });
});

describe('resampleLinear', () => {
  it('returns a copy with equal content when rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const out = resampleLinear(input, 24000, 24000);
    expect(out).not.toBe(input);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('halves the length (within 1 sample) when downsampling 48k to 24k', () => {
    const input = new Float32Array(480);
    const out = resampleLinear(input, 48000, 24000);
    expect(Math.abs(out.length - 240)).toBeLessThanOrEqual(1);
  });

  it('interpolates linearly on a known ramp', () => {
    // [0, 1] upsampled from 2 to 4 samples spans the same ramp: 0, 1/3, 2/3, 1
    const out = resampleLinear(new Float32Array([0, 1]), 2, 4);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1 / 3, 5);
    expect(out[2]).toBeCloseTo(2 / 3, 5);
    expect(out[3]).toBeCloseTo(1, 5);
  });

  it('returns empty output for empty input', () => {
    expect(resampleLinear(new Float32Array(0), 48000, 24000).length).toBe(0);
  });
});

describe('encodeWavPcm16', () => {
  it('builds a byte-exact 44-byte RIFF/WAVE header followed by the payload', async () => {
    const pcm = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const blob = encodeWavPcm16(pcm, 24000, 1);

    expect(blob.size).toBe(44 + pcm.byteLength);
    expect(blob.type).toBe('audio/wav');

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const ascii = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(buffer, offset, length));

    expect(ascii(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + pcm.byteLength);
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint32(28, true)).toBe(24000 * 1 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(1 * 2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.byteLength);
    expect(Array.from(new Uint8Array(buffer, 44))).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it('encodes stereo parameters correctly', async () => {
    const pcm = new Uint8Array(8);
    const blob = encodeWavPcm16(pcm, 44100, 2);
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2);
    expect(view.getUint16(32, true)).toBe(4);
  });

  it('handles empty PCM payload', async () => {
    const blob = encodeWavPcm16(new Uint8Array(0), 24000, 1);
    expect(blob.size).toBe(44);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint32(4, true)).toBe(36);
    expect(view.getUint32(40, true)).toBe(0);
  });

  it('round-trips PCM16 samples through float conversion and WAV encoding', async () => {
    const int16 = floatTo16BitPcm(new Float32Array([0, 0.5, -0.5, 1, -1]));
    // Int16Array is platform-endian; tests run on little-endian targets, matching WAV.
    const pcmBytes = new Uint8Array(int16.buffer);
    const blob = encodeWavPcm16(pcmBytes, STREAM_SAMPLE_RATE, 1);
    const view = new DataView(await blob.arrayBuffer());
    for (let i = 0; i < int16.length; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(int16[i]);
    }
  });
});
