/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sentence tokenizer for the voice-read feature.
 *
 * Splits mixed Chinese/English text into speakable sentences. A sentence is
 * "closed" when it ends with a terminator; the trailing fragment of a
 * streaming text is reported as unclosed so the caller can wait for more
 * content instead of reading a half sentence aloud.
 */

export interface SentenceToken {
  sentence: string;
  closed: boolean;
}

// CJK terminators + newline always close a sentence.
const HARD_BREAK = /[。！？!?；;…\n]/;

export function tokenizeSentences(text: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  if (!text) return tokens;

  let buf = '';
  const push = (closed: boolean) => {
    const sentence = buf.trim();
    buf = '';
    if (sentence) tokens.push({ sentence, closed });
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    buf += ch;

    if (HARD_BREAK.test(ch)) {
      push(true);
      continue;
    }
    if (ch === '.') {
      const prev = text[i - 1];
      const next = text[i + 1];
      const isDecimal = Boolean(prev && /\d/.test(prev) && next && /\d/.test(next));
      const isEllipsis = next === '.';
      // Break only on a real sentence end: "end. Next" or trailing "end."
      if (!isDecimal && !isEllipsis && (next === undefined || /\s/.test(next))) {
        push(true);
      }
      continue;
    }
    if (ch === ':') {
      const next = text[i + 1];
      // Avoid splitting "12:30"; break on "note: something" or trailing colon.
      if (next === undefined || /\s/.test(next)) {
        push(true);
      }
      continue;
    }
    if (ch === '：') {
      push(true);
    }
  }
  push(false);
  return tokens;
}
