/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Covers the image-pick failure classifier (AIONUI-224 / issue #4073).
 *
 * The native file dialog can return a path the backend refuses to read —
 * another drive, or a cloud-redirected Desktop — and `POST /api/fs/image-base64`
 * answers 403 with `code: "PATH_OUTSIDE_SANDBOX"`. That case earns a specific,
 * actionable message; every other failure falls back to the generic text.
 */

import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { getImagePickErrorMessage } from '@/renderer/components/media/imagePickError';

/** Stub `t` that echoes the key, so assertions pin the key that was chosen. */
const t = ((key: string) => key) as unknown as TFunction;

/** A 403 shaped exactly like the backend `ErrorResponse` envelope. */
const sandboxError = () =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/fs/image-base64',
    status: 403,
    body: {
      success: false,
      error: 'Path is outside the allowed sandbox.',
      code: 'PATH_OUTSIDE_SANDBOX',
      details: { field: 'path', operation: 'access' },
    },
  });

describe('getImagePickErrorMessage', () => {
  it('returns the actionable message for a PATH_OUTSIDE_SANDBOX rejection', () => {
    expect(getImagePickErrorMessage(sandboxError(), t)).toBe('settings.imagePickOutsideSandbox');
  });

  it('recognises the sandbox rejection through the duck-typed guard', () => {
    // vite-dev HMR can split the module so `instanceof` fails; isBackendHttpError
    // falls back to shape detection and the classifier must follow it.
    const duckTyped = {
      name: 'BackendHttpError',
      status: 403,
      code: 'PATH_OUTSIDE_SANDBOX',
    };
    expect(getImagePickErrorMessage(duckTyped, t)).toBe('settings.imagePickOutsideSandbox');
  });

  it('falls back to the generic message for a different backend error code', () => {
    const other = new BackendHttpError({
      method: 'POST',
      path: '/api/fs/image-base64',
      status: 404,
      body: { success: false, error: 'not found', code: 'NOT_FOUND' },
    });
    expect(getImagePickErrorMessage(other, t)).toBe('common.failed');
  });

  it('falls back to the generic message for a plain Error', () => {
    expect(getImagePickErrorMessage(new Error('boom'), t)).toBe('common.failed');
  });

  it('falls back to the generic message for an empty payload (null)', () => {
    expect(getImagePickErrorMessage(null, t)).toBe('common.failed');
  });

  it('does not string-match the sandbox wording on a non-backend error', () => {
    // Guards against a message-sniffing heuristic creeping back in: only the
    // machine-readable `code` may select the specific message.
    expect(getImagePickErrorMessage(new Error('Path is outside the allowed sandbox.'), t)).toBe('common.failed');
  });

  it('never returns an empty string', () => {
    for (const input of [sandboxError(), new Error('x'), null, undefined, 'oops', 42]) {
      expect(getImagePickErrorMessage(input, t)).not.toBe('');
    }
  });
});
