/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for Float32Array <-> Buffer helpers (indexer-01-03).
 */

import { describe, expect, it } from 'vitest';
import { deserializeVector, serializeVector } from '@/process/services/indexer/vectors';

describe('serializeVector / deserializeVector', () => {
  it('round-trips a basic Float32Array', () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const blob = serializeVector(input);
    expect(blob).toBeInstanceOf(Buffer);
    expect(blob.byteLength).toBe(input.byteLength);

    const decoded = deserializeVector(blob);
    expect(Array.from(decoded)).toEqual([1, 2, 3, 4]);
  });

  it('round-trips a Float32Array with non-integer values', () => {
    const input = new Float32Array([0.1, -0.25, 1.5e-3, 1234.5]);
    const blob = serializeVector(input);
    const decoded = deserializeVector(blob);
    for (let i = 0; i < input.length; i += 1) {
      expect(decoded[i]).toBeCloseTo(input[i], 6);
    }
  });

  it('round-trips an empty Float32Array', () => {
    const input = new Float32Array(0);
    const blob = serializeVector(input);
    expect(blob.byteLength).toBe(0);
    const decoded = deserializeVector(blob);
    expect(decoded.length).toBe(0);
  });

  it('round-trips a Float32Array subarray view without copying the full buffer', () => {
    const full = new Float32Array([0, 0, 1, 2, 3, 4, 0]);
    const view = full.subarray(2, 6);
    const blob = serializeVector(view);
    expect(blob.byteLength).toBe(view.byteLength);

    const decoded = deserializeVector(blob);
    expect(Array.from(decoded)).toEqual([1, 2, 3, 4]);
  });

  it('enforces expected dimensions when provided', () => {
    const input = new Float32Array([1, 2, 3]);
    const blob = serializeVector(input);
    expect(() => deserializeVector(blob, 4)).toThrow(/dimensions/);
    expect(deserializeVector(blob, 3).length).toBe(3);
  });
});
