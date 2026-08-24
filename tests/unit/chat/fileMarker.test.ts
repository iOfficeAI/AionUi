/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { parseFileMarker, resolveMessageFilePath } from '@/renderer/pages/conversation/Messages/components/fileMarker';

const FILES = '[[AION_FILES]]';

describe('parseFileMarker', () => {
  it('is a no-op when the message cannot carry attachments', () => {
    const content = `hi\n\n${FILES}\n/abs/a.rs`;
    expect(parseFileMarker(content, false)).toEqual({ text: content, files: [] });
  });

  it('splits the text from the attachment paths', () => {
    const { text, files } = parseFileMarker(`看下这个\n\n${FILES}\n/abs/a.rs\n/abs/b.rs`, true);
    expect(text).toBe('看下这个');
    expect(files).toEqual(['/abs/a.rs', '/abs/b.rs']);
  });

  it('renders verbatim when a non-path line follows the marker', () => {
    // All-or-nothing on purpose: a message that merely mentions the marker must
    // not have its tail eaten.
    const content = `hi\n\n${FILES}\nnot a path`;
    expect(parseFileMarker(content, true)).toEqual({ text: content, files: [] });
  });

  it('renders verbatim when the marker has nothing after it', () => {
    const content = `hi\n\n${FILES}`;
    expect(parseFileMarker(content, true)).toEqual({ text: content, files: [] });
  });

  // The regression this file exists for. The backend now keeps [[AION_FILES]]
  // last, but relying on that alone meant any future trailing block silently
  // killed the file chips and dumped the raw marker into the bubble.
  it('still parses paths when another marker block follows the files block', () => {
    const content = [
      '看下 src/auth.rs，然后问下他',
      '',
      FILES,
      '/Users/you/proj/src/auth.rs',
      '',
      '[[AION_SESSIONS]]',
      '重构-鉴权模块\tconv_019f\tworkspace: same',
      '[[/AION_SESSIONS]]',
    ].join('\n');

    const { text, files } = parseFileMarker(content, true);

    expect(files).toEqual(['/Users/you/proj/src/auth.rs']);
    expect(text).not.toContain(FILES);
    expect(text).not.toContain('/Users/you/proj/src/auth.rs');
    // The trailing block is left in place for the session parser to consume —
    // dropping it here would swallow the `@@` chips instead.
    expect(text).toContain('[[AION_SESSIONS]]');
  });

  it('stops at the next marker even when that block contains slashes', () => {
    // A cross-workspace session line carries an absolute path, so it would pass
    // the path test and be misreported as an attachment.
    const content = [
      'hi',
      '',
      FILES,
      '/abs/a.rs',
      '[[AION_SESSIONS]]',
      '文档站改版\tconv_01a0\tworkspace: /Users/x/docs（与你不同）',
      '[[/AION_SESSIONS]]',
    ].join('\n');

    expect(parseFileMarker(content, true).files).toEqual(['/abs/a.rs']);
  });

  it('reads the last files marker when the text quotes an earlier one', () => {
    const content = `talking about ${FILES}\n\n${FILES}\n/abs/a.rs`;
    const { files } = parseFileMarker(content, true);
    expect(files).toEqual(['/abs/a.rs']);
  });
});

describe('resolveMessageFilePath', () => {
  it('leaves absolute paths alone', () => {
    expect(resolveMessageFilePath('/abs/a.rs', '/ws')).toBe('/abs/a.rs');
  });

  it('joins a relative path onto the workspace', () => {
    expect(resolveMessageFilePath('src/a.rs', '/ws/')).toBe('/ws/src/a.rs');
  });

  it('returns the path unchanged without a workspace', () => {
    expect(resolveMessageFilePath('src/a.rs')).toBe('src/a.rs');
  });
});
