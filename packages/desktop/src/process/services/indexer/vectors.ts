/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export function serializeVector(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function deserializeVector(blob: Buffer, dimensions?: number): Float32Array {
  const vector = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
  if (dimensions !== undefined && vector.length !== dimensions) {
    throw new Error(`Expected ${dimensions} dimensions, got ${vector.length}`);
  }
  return vector;
}
