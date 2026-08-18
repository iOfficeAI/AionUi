/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guards the migration letter's data-handover copy.
 *
 * The AionUi (open-source) and the new signed build are two distinct macOS
 * apps. When a user signs in to the new build for the first time it claims the
 * local data, after which reopening the old build shows an empty state. The
 * letter must therefore say two things in every locale, or users read "you can
 * keep using the current version" as "I can freely switch back" and report
 * data loss:
 *
 *   - promise2: the inheritance is a ONE-TIME migration, not a copy
 *   - noRush: the current build stays usable only while you have not signed in
 *     to the new one
 *
 * Copy is free to be reworded; these assertions only check that the caveat has
 * not been dropped, by requiring the copy to be materially longer than the
 * original single-clause sentences it replaced.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = path.resolve(__dirname, '../../../packages/desktop/src/renderer/services/i18n/locales');

// Original pre-caveat copy lengths were ~100-170 chars for latin locales and
// ~45-60 for CJK. The caveat roughly doubles them; these floors sit above the
// old copy but well below the new, so honest rewording will not trip them.
const MIN_CHARS: Record<string, { promise2: number; noRush: number }> = {
  'zh-CN': { promise2: 70, noRush: 60 },
  'zh-TW': { promise2: 70, noRush: 60 },
  'ja-JP': { promise2: 70, noRush: 60 },
  'ko-KR': { promise2: 70, noRush: 60 },
};
const DEFAULT_MIN = { promise2: 200, noRush: 180 };

const readLetter = (locale: string): Record<string, string> => {
  const file = path.join(LOCALES_DIR, locale, 'update.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    migration: { letter: Record<string, string> };
  };
  return json.migration.letter;
};

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

describe('migration letter data-handover copy', () => {
  it('ships every supported locale', () => {
    expect(locales.length).toBeGreaterThanOrEqual(13);
    expect(locales).toContain('zh-CN');
    expect(locales).toContain('en-US');
  });

  it.each(locales)('%s states the migration caveat in promise2 and noRush', (locale) => {
    const letter = readLetter(locale);
    const min = MIN_CHARS[locale] ?? DEFAULT_MIN;

    expect(letter.promise2, `${locale} promise2 missing`).toBeTruthy();
    expect(letter.noRush, `${locale} noRush missing`).toBeTruthy();

    // The caveat clause must still be there — bare "data is inherited" /
    // "current version keeps working" copy is materially shorter.
    expect(
      letter.promise2.length,
      `${locale} promise2 looks like it lost the one-time-migration caveat`
    ).toBeGreaterThanOrEqual(min.promise2);
    expect(letter.noRush.length, `${locale} noRush looks like it lost the sign-in condition`).toBeGreaterThanOrEqual(
      min.noRush
    );
  });

  it('zh-CN names the migration as one-time and conditions the fallback on sign-in', () => {
    const letter = readLetter('zh-CN');
    expect(letter.promise2).toContain('一次性');
    expect(letter.noRush).toContain('首次登录');
  });

  it('en-US names the migration as one-time and conditions the fallback on sign-in', () => {
    const letter = readLetter('en-US');
    expect(letter.promise2.toLowerCase()).toContain('one-time');
    expect(letter.noRush.toLowerCase()).toContain('first sign-in');
  });
});
