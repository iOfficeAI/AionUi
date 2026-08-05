/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The file-type matrix, and the two independent implementations of it agreeing.
//
// Every mapping here fixes a path that used to fail: `.csv` was handed to the
// spreadsheet renderer, which rejects CSV outright; legacy Office, ODF and
// macro-enabled formats were handed to officecli, which cannot open them and whose
// failure told the user to install officecli; `.heic` fell through to `code` and
// was read as UTF-8, producing a 500.
//
// The last block is the one most likely to rot: the repo judges file type in TWO
// places, reached by different entry points, and a mapping added to only one makes
// the same file behave differently depending on where it was clicked.

import { describe, expect, it } from 'vitest';
import {
  FILE_EXTENSION_MAP,
  getContentTypeByExtension,
  isOfficeFile,
  isTextFile,
} from '@/renderer/pages/conversation/Preview/fileUtils';
import { EXTENSION_MAP, getFileTypeInfo } from '@/renderer/utils/file/fileType';

/** Formats officecli genuinely renders. */
const OOXML = [
  ['a.docx', 'word'],
  ['b.xlsx', 'excel'],
  ['c.pptx', 'ppt'],
] as const;

/**
 * Identifiable but unrenderable. Legacy binaries and ODF are outside officecli's
 * OOXML support; macro-enabled formats are accepted by its factory but refused by
 * its watch path; HEIC has no decoder in Chromium.
 */
const UNSUPPORTED = [
  'old.doc',
  'old.xls',
  'old.ppt',
  'open.odt',
  'open.ods',
  'open.odp',
  'macro.docm',
  'macro.xlsm',
  'macro.pptm',
  'photo.heic',
] as const;

describe('office formats map only to what can render them', () => {
  it.each(OOXML)('%s renders as %s', (name, expected) => {
    expect(getContentTypeByExtension(name)).toBe(expected);
  });

  it.each(UNSUPPORTED)('%s is reported as unsupported rather than sent to a renderer', (name) => {
    expect(getContentTypeByExtension(name)).toBe('unsupported');
  });

  // The old mapping put these under word/excel/ppt, so `isOfficeFile` claimed them
  // and callers treated them as previewable Office documents.
  it.each(UNSUPPORTED)('%s no longer counts as an Office file', (name) => {
    expect(isOfficeFile(name)).toBe(false);
  });

  it.each(OOXML)('%s still counts as an Office file', (name) => {
    expect(isOfficeFile(name)).toBe(true);
  });
});

describe('csv is text, not a spreadsheet', () => {
  it('maps .csv to its own text-ish type', () => {
    expect(getContentTypeByExtension('data.csv')).toBe('csv');
  });

  // Previously `excel` → officecli, which rejects .csv, so every CSV failed.
  it('does not route .csv to the spreadsheet renderer', () => {
    expect(getContentTypeByExtension('data.csv')).not.toBe('excel');
  });

  it('treats .csv as a text file', () => {
    expect(isTextFile('data.csv')).toBe(true);
  });

  it('does not treat .csv as an Office file', () => {
    expect(isOfficeFile('data.csv')).toBe(false);
  });
});

describe('heic is named as unsupported instead of read as text', () => {
  // Unmapped extensions fall back to `code`, which reads UTF-8 — a HEIC photo then
  // failed with a 500 rather than an explanation.
  it('does not fall through to the code fallback', () => {
    expect(getContentTypeByExtension('IMG_1234.heic')).toBe('unsupported');
  });

  // Mapping it to `image` would be worse than the 500: Chromium cannot decode HEVC,
  // so the user would get a broken-image placeholder with no explanation at all.
  it('is not claimed as a previewable image', () => {
    expect(getContentTypeByExtension('IMG_1234.heic')).not.toBe('image');
  });
});

describe('unchanged mappings still hold', () => {
  it.each([
    ['readme.md', 'markdown'],
    ['index.html', 'html'],
    ['report.pdf', 'pdf'],
    ['logo.png', 'image'],
    ['change.diff', 'diff'],
    ['script.ts', 'code'],
    ['noextension', 'code'],
  ] as const)('%s → %s', (name, expected) => {
    expect(getContentTypeByExtension(name)).toBe(expected);
  });
});

// Two implementations, different entry points: `getContentTypeByExtension` serves
// the explorer and local-file links, `getFileTypeInfo` serves diff cards and
// message file-change rows. They must not disagree, or the same file opens one way
// from the tree and another way from a message.
describe('both type judgements agree', () => {
  /**
   * Every extension either table maps, derived from their key sets rather than
   * hand-listed — a hand-written list silently omits whatever the author forgot,
   * which is how `.mdown` / `.mkd` sat in one table and not the other.
   *
   * Deriving the *inputs* this way is safe; the assertion still calls the two
   * public resolvers separately and compares their answers, so the two tables
   * remain independent sources. (Comparing a table against itself would be
   * tautological and pass no matter how far they drift.)
   */
  const everyMappedExtension = [
    ...new Set([...Object.values(FILE_EXTENSION_MAP).flat(), ...Object.keys(EXTENSION_MAP)]),
  ].toSorted();

  it('derives a non-trivial extension list (guards against an empty sweep)', () => {
    expect(everyMappedExtension.length).toBeGreaterThan(25);
    // The gap that motivated deriving instead of hand-listing.
    expect(everyMappedExtension).toContain('mdown');
    expect(everyMappedExtension).toContain('mkd');
  });

  it.each(everyMappedExtension)('.%s resolves to the same content type in both maps', (ext) => {
    const name = `sample.${ext}`;
    expect(getFileTypeInfo(name).contentType).toBe(getContentTypeByExtension(name));
  });

  it('agrees on the unmapped fallback too', () => {
    expect(getFileTypeInfo('mystery.xyz').contentType).toBe(getContentTypeByExtension('mystery.xyz'));
  });

  // Editability is only meaningful for things that render as text.
  it('marks csv editable and unsupported formats not', () => {
    expect(getFileTypeInfo('data.csv').editable).toBe(true);
    expect(getFileTypeInfo('old.doc').editable).toBe(false);
    expect(getFileTypeInfo('photo.heic').editable).toBe(false);
  });
});
