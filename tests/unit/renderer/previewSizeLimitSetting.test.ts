/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The configurable text size limit (settings → system, in MB).
//
// Two things are worth pinning here, and they are different in kind:
//
//  1. The **normalizer** is total: every unusable value maps to the default rather
//     than to 0. A limit of 0 would make every file oversized, switching the preview
//     panel off through a field that never says so.
//  2. The limit is read **once per open** and reported back as `thresholdBytes`.
//     That snapshot is what makes "a changed limit applies to newly opened tabs
//     only" true — reading it at render time would flip a tab being edited into the
//     "too large" state mid-edit.
//
// The settings read is mocked explicitly. It has to be: `resolvePreviewPayload`
// swallows a failed read on purpose (falling back to the default), so a test that
// left it unmocked would pass while asserting nothing about the configured value —
// the failure would be indistinguishable from the default.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  readContent: vi.fn(),
  getContentMetadata: vi.fn(),
  getClientBusinessSetting: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: { readContent: { invoke: h.readContent }, getContentMetadata: { invoke: h.getContentMetadata } },
  },
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: h.getClientBusinessSetting,
  setClientBusinessSetting: vi.fn(),
}));

import {
  DEFAULT_TEXT_PREVIEW_LIMIT_MB,
  MAX_TEXT_PREVIEW_LIMIT_MB,
  MIN_TEXT_PREVIEW_LIMIT_MB,
  formatSizeAboveLimit,
  normalizeTextPreviewLimitMb,
  resolvePreviewPayload,
  textPreviewLimitBytes,
} from '@/renderer/utils/file/previewPayload';

const MB = 1024 * 1024;
const ref = { kind: 'local' as const, path: '/abs/file.txt' };

const meta = (size: number, lastModified = 1_700_000_000_000) => ({
  name: 'file.txt',
  path: '/abs/file.txt',
  size,
  type: 'file',
  lastModified,
});

/** Mirrors the app's byte formatter, with selectable precision. */
const format = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

beforeEach(() => {
  h.readContent.mockReset().mockResolvedValue('content');
  h.getContentMetadata.mockReset().mockResolvedValue(meta(10));
  // Default: nothing configured. Individual tests override.
  h.getClientBusinessSetting.mockReset().mockResolvedValue(undefined);
});

describe('normalizeTextPreviewLimitMb', () => {
  it('keeps a value already inside the accepted range', () => {
    expect(normalizeTextPreviewLimitMb(5)).toBe(5);
  });

  it('keeps a fractional value — 1.5 MB is a reasonable thing to want', () => {
    expect(normalizeTextPreviewLimitMb(1.5)).toBe(1.5);
  });

  // Each of these would otherwise reach the byte conversion and produce a limit the
  // user never chose. `0` is the dangerous one: it makes every file oversized.
  it.each<[string, unknown]>([
    ['never configured', undefined],
    ['cleared to null by storage', null],
    ['an emptied number input', NaN],
    ['a non-number from hand-edited storage', '4'],
    ['Infinity', Infinity],
  ])('falls back to the default for %s', (_label, input) => {
    expect(normalizeTextPreviewLimitMb(input)).toBe(DEFAULT_TEXT_PREVIEW_LIMIT_MB);
  });

  it('clamps zero up to the minimum rather than gating off every file', () => {
    expect(normalizeTextPreviewLimitMb(0)).toBe(MIN_TEXT_PREVIEW_LIMIT_MB);
    // The distinction that matters: 0 must not survive as a ceiling.
    expect(textPreviewLimitBytes(0)).toBeGreaterThan(0);
  });

  it('clamps a negative value up to the minimum', () => {
    expect(normalizeTextPreviewLimitMb(-10)).toBe(MIN_TEXT_PREVIEW_LIMIT_MB);
  });

  it('clamps an implausibly large value down to the maximum', () => {
    // e.g. someone pastes a byte count into a field labelled MB.
    expect(normalizeTextPreviewLimitMb(1_048_576)).toBe(MAX_TEXT_PREVIEW_LIMIT_MB);
  });
});

describe('textPreviewLimitBytes', () => {
  it('converts whole megabytes to bytes', () => {
    expect(textPreviewLimitBytes(3)).toBe(3 * MB);
  });

  it('converts a fractional limit to a whole number of bytes', () => {
    expect(textPreviewLimitBytes(1.5)).toBe(1.5 * MB);
    expect(Number.isInteger(textPreviewLimitBytes(1.5))).toBe(true);
  });

  it('defaults to 1 MB when nothing is configured', () => {
    expect(textPreviewLimitBytes(undefined)).toBe(DEFAULT_TEXT_PREVIEW_LIMIT_MB * MB);
  });
});

describe('the configured limit reaches the size check', () => {
  it('uses the configured limit instead of the built-in default', async () => {
    h.getClientBusinessSetting.mockResolvedValue(5);
    // Comfortably over the 1 MB default, comfortably under the configured 5 MB.
    h.getContentMetadata.mockResolvedValue(meta(3 * MB));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.oversized).toBe(false);
    expect(out.thresholdBytes).toBe(5 * MB);
    // The point of raising the limit: the content is actually read.
    expect(h.readContent).toHaveBeenCalled();
  });

  it('gates a file that exceeds a lowered limit', async () => {
    h.getClientBusinessSetting.mockResolvedValue(2);
    h.getContentMetadata.mockResolvedValue(meta(3 * MB));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.oversized).toBe(true);
    expect(out.thresholdBytes).toBe(2 * MB);
    expect(h.readContent).not.toHaveBeenCalled();
  });

  it('reads the limit under the documented key', async () => {
    await resolvePreviewPayload(ref, 'code');
    expect(h.getClientBusinessSetting).toHaveBeenCalledWith('preview.textSizeLimitMb');
  });

  // Same boundary rule as before this became configurable: a file of exactly the
  // limit is within it. Changing this to `>=` would newly reject files that used to
  // open.
  it('treats a file exactly at the configured limit as within it', async () => {
    h.getClientBusinessSetting.mockResolvedValue(4);
    h.getContentMetadata.mockResolvedValue(meta(4 * MB));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.oversized).toBe(false);
    expect(h.readContent).toHaveBeenCalled();
  });

  it('treats one byte over the configured limit as oversized', async () => {
    h.getClientBusinessSetting.mockResolvedValue(4);
    h.getContentMetadata.mockResolvedValue(meta(4 * MB + 1));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.oversized).toBe(true);
  });

  it('applies a fractional configured limit', async () => {
    h.getClientBusinessSetting.mockResolvedValue(1.5);
    h.getContentMetadata.mockResolvedValue(meta(1.5 * MB + 1));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.oversized).toBe(true);
    expect(out.thresholdBytes).toBe(1.5 * MB);
  });

  it('falls back to the default ceiling when the settings read fails', async () => {
    // Refusing to open a file because a preference could not be read would be worse
    // than gating it at the default.
    h.getClientBusinessSetting.mockRejectedValue(new Error('settings unavailable'));
    h.getContentMetadata.mockResolvedValue(meta(2 * MB));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.thresholdBytes).toBe(DEFAULT_TEXT_PREVIEW_LIMIT_MB * MB);
    expect(out.oversized).toBe(true);
  });

  it('clamps an unusable stored value rather than trusting it', async () => {
    // A stored 0 would otherwise gate off every file.
    h.getClientBusinessSetting.mockResolvedValue(0);
    h.getContentMetadata.mockResolvedValue(meta(10));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.thresholdBytes).toBe(MIN_TEXT_PREVIEW_LIMIT_MB * MB);
    expect(out.oversized).toBe(false);
  });

  it('leaves the image ceiling alone — the text setting must not move it', async () => {
    h.getClientBusinessSetting.mockResolvedValue(2);
    h.getContentMetadata.mockResolvedValue(meta(10 * MB));
    h.readContent.mockResolvedValue('data:image/png;base64,QQ==');

    const out = await resolvePreviewPayload(ref, 'image');

    // 10 MB is over the configured text limit but under the image ceiling.
    expect(out.oversized).toBe(false);
    expect(out.thresholdBytes).toBe(20 * MB);
  });

  it('still applies no ceiling to content-free types', async () => {
    h.getClientBusinessSetting.mockResolvedValue(1);
    h.getContentMetadata.mockResolvedValue(meta(900 * MB));

    const out = await resolvePreviewPayload(ref, 'pdf');

    expect(out.thresholdBytes).toBeUndefined();
    expect(out.oversized).toBe(false);
  });
});

describe('the limit is snapshotted per open, not read at render time', () => {
  // The guarantee: a tab reports the ceiling that applied when it opened. Two tabs
  // opened under different settings therefore disagree, and neither changes later.
  it('reports the ceiling in force at open time, so a later change cannot reclassify it', async () => {
    h.getContentMetadata.mockResolvedValue(meta(3 * MB));

    h.getClientBusinessSetting.mockResolvedValue(5);
    const openedWideOpen = await resolvePreviewPayload(ref, 'code');

    // User lowers the limit; the already-resolved payload must be untouched.
    h.getClientBusinessSetting.mockResolvedValue(2);
    const openedAfterLowering = await resolvePreviewPayload(ref, 'code');

    expect(openedWideOpen.thresholdBytes).toBe(5 * MB);
    expect(openedWideOpen.oversized).toBe(false);
    expect(openedAfterLowering.thresholdBytes).toBe(2 * MB);
    expect(openedAfterLowering.oversized).toBe(true);
  });

  it('reads the setting exactly once per open', async () => {
    // More than once would mean two reads could disagree within a single open,
    // producing a payload whose `oversized` and `thresholdBytes` describe different
    // limits.
    await resolvePreviewPayload(ref, 'code');
    expect(h.getClientBusinessSetting).toHaveBeenCalledTimes(1);
  });
});

describe('the oversized notice still reads correctly at a configured limit', () => {
  // The "1 MB exceeds 1 MB" fix has to keep working once the limit is not 1 MB:
  // the message compares the file size against whatever ceiling applied.
  it('renders a size visibly larger than a fractional limit', () => {
    const limit = 1.5 * MB;
    const text = formatSizeAboveLimit(limit + 1, limit, format);

    expect(text).not.toBe(format(limit));
  });

  it('falls back to "more than" when a whole-MB limit is exceeded by one byte', () => {
    const limit = 4 * MB;
    expect(formatSizeAboveLimit(limit + 1, limit, format)).toBe(`> ${format(limit)}`);
  });

  it('renders the real size when the difference is large enough to show', () => {
    const limit = 2 * MB;
    expect(formatSizeAboveLimit(3 * MB, limit, format)).toBe('3 MB');
  });
});
