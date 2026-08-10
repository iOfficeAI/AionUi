/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The Explorer must not decide editability for itself.
//
// `editable` had two unrelated producers. Messages and diffs asked the type table via
// `getFileTypeInfo`; the Explorer computed its own answer from a content type alone,
// because `getContentTypeByExtension` cannot return editability at all. The two agreed
// on everything that reached a consumer, and agreement was the only thing holding them
// together — the day they diverged, one file would behave differently depending on
// whether it was opened from the tree or from a message.
//
// What this pins is therefore NOT "the two answers match". Now that both read the same
// table, comparing them is comparing a value to itself: mutating the table moves both
// sides and the assertion survives. That was measured, not assumed — an earlier version
// of this file did exactly that and stayed green while the table lied.
//
// Instead the table is replaced by a sentinel and the Explorer's output is required to
// carry it through untouched. A second producer cannot pass this: to answer at all it
// would have to invent a value, and no invented value equals the sentinel.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFileTypeInfo = vi.hoisted(() => vi.fn());
const getContentMetadata = vi.hoisted(() => vi.fn(async () => ({ size: 10, lastModified: 1 })));

vi.mock('@/renderer/utils/file/fileType', () => ({ getFileTypeInfo }));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getContentMetadata: { invoke: getContentMetadata },
      readContent: { invoke: async () => 'x' },
    },
  },
}));

vi.mock('@/common/config/clientSettings', () => ({
  getClientBusinessSetting: async () => undefined,
}));

import { buildExplorerPreviewPayload } from '@/renderer/pages/conversation/explorer/ExplorerContainer';

/**
 * A content type that exists, paired with an editability the real table never assigns
 * to it: `image` is `editable: false` everywhere in the type table.
 *
 * That pairing is what makes the assertion meaningful. If the Explorer decided for
 * itself it would say `false` for an image — the plausible answer, and the one the old
 * code gave — so passing this through proves the value was taken rather than derived.
 */
const SENTINEL = { contentType: 'image', editable: true, language: 'sentinel' } as const;

beforeEach(() => {
  getFileTypeInfo.mockReset().mockReturnValue({ ...SENTINEL });
  getContentMetadata.mockReset().mockResolvedValue({ size: 10, lastModified: 1 });
});

describe('editable comes from the type table, not from the Explorer', () => {
  it('passes the table answer through untouched', async () => {
    const out = await buildExplorerPreviewPayload('peA', 'pics/logo.png');

    // The table was asked, and asked about the file name rather than the whole path.
    expect(getFileTypeInfo).toHaveBeenCalledWith('logo.png');
    // Its answer survives: `false` here would mean something recomputed it locally.
    expect(out.metadata.editable).toBe(true);
  });

  // The reverse direction, so the test cannot pass by the Explorer hardcoding `true`.
  it('passes a read-only answer through just as faithfully', async () => {
    getFileTypeInfo.mockReturnValue({ contentType: 'code', editable: false, language: 'sentinel' });

    const out = await buildExplorerPreviewPayload('peA', 'src/main.py');

    expect(out.metadata.editable).toBe(false);
  });

  // The one modification allowed, and the reason the rule is "may only tighten" rather
  // than "must match". An oversized file was never fully read, so letting a fragment
  // reach a saveable editor is what destroyed files before — that is a fact about this
  // read, not about the type, and the table cannot express it.
  it('may refuse an editor for a file too large to have been read', async () => {
    getContentMetadata.mockResolvedValue({ size: 50 * 1024 * 1024, lastModified: 1 });
    getFileTypeInfo.mockReturnValue({ contentType: 'code', editable: true, language: 'sentinel' });

    const out = await buildExplorerPreviewPayload('peA', 'logs/huge.log');

    expect(out.metadata.oversized).toBe(true);
    // Tightened despite the table permitting an editor — and only in this direction.
    expect(out.metadata.editable).toBe(false);
  });
});
