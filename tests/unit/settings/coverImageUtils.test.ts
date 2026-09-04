/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateCoverImageFile,
  MAX_COVER_IMAGE_BYTES,
} from '@/renderer/pages/settings/AppearanceSettings/coverImageUtils';

describe('validateCoverImageFile', () => {
  it('accepts an image within the size cap', () => {
    expect(validateCoverImageFile({ type: 'image/png', size: 512 * 1024 })).toEqual({ ok: true });
  });

  it('accepts an image exactly at the size cap', () => {
    expect(validateCoverImageFile({ type: 'image/jpeg', size: MAX_COVER_IMAGE_BYTES })).toEqual({ ok: true });
  });

  it('rejects a non-image file', () => {
    expect(validateCoverImageFile({ type: 'application/pdf', size: 1024 })).toEqual({ ok: false, reason: 'type' });
  });

  it('rejects a file with no MIME type', () => {
    expect(validateCoverImageFile({ type: '', size: 1024 })).toEqual({ ok: false, reason: 'type' });
  });

  it('rejects an image larger than the size cap', () => {
    expect(validateCoverImageFile({ type: 'image/png', size: MAX_COVER_IMAGE_BYTES + 1 })).toEqual({
      ok: false,
      reason: 'size',
    });
  });
});
