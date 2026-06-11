/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extract a TTS-friendly spoken block from an assistant message body.
 *
 * Voice mode is a contract with the model: when enabled, the model appends
 * ONE fenced code block with the info string `spoken` containing a 1–3
 * sentence summary that's safe to read aloud. This helper finds the LAST
 * such complete block and removes it (plus the rest of any unterminated
 * `spoken` fence) from the rendered text.
 *
 * Both ``` and ~~~ fences are supported; leading whitespace before the
 * opening fence is allowed (CommonMark permits up to three spaces); CRLF
 * and LF line endings are both accepted.
 *
 * This runs on every assistant message render. Keep it cheap — bail fast
 * when the input contains neither ```spoken nor ~~~spoken. The regex is
 * intentionally non-greedy and state-machine-free.
 */

export type ExtractSpokenBlockResult = {
  /** The last complete spoken block's text body, or `null` if none. */
  spoken: string | null;
  /**
   * True when a closing fence was found for the spoken block. False when
   * an unterminated `spoken` fence is still being streamed.
   */
  complete: boolean;
  /**
   * The message body with every spoken block removed (and any trailing
   * unterminated spoken fence stripped). Trailing blank lines are trimmed
   * so the markdown renderer doesn't introduce a stray empty paragraph.
   */
  displayText: string;
};

// Marker characters for the two fence styles we accept. Kept as
// constants (not inlined) so a future contributor can grep for them
// when adding new fence dialects.
const FENCE_BACKTICK = '```';
const FENCE_TILDE = '~~~';
void FENCE_BACKTICK;
void FENCE_TILDE;

// Regex notes:
//   - `^[ \t]{0,3}` tolerates the 0–3 leading spaces CommonMark allows
//     before an opening fence (more is treated as an indented code block).
//   - The info-string group is non-greedy and stops at the first newline
//     (the info string lives on the opening fence's line only).
//   - `[\s\S]*?` is the non-greedy body match for the block content.
//   - The closing fence is the same marker, length ≥ opening length, with
//     no info string and only optional trailing whitespace. We match a
//     minimum of 3 of the same character to keep the regex anchored to
//     the marker itself (no info string).
//   - The `i` flag keeps the parser robust to any model quirks that
//     emit `SPOKEN` (uppercase). The OpenCode contract uses lowercase.
const SPOKEN_RE = /^[ \t]{0,3}(```|~~~)[ \t]*spoken[ \t]*[^\n]*\r?\n([\s\S]*?)\r?\n^[ \t]{0,3}\1[ \t]*(?=\r?\n|$)/gim;

/**
 * @param markdown - The raw assistant message text.
 * @returns Structured extraction result. `displayText` is always safe to
 *   feed into the markdown renderer; `spoken`/`complete` drive the spoken
 *   row UI and the playback queue.
 */
export function extractSpokenBlock(markdown: string): ExtractSpokenBlockResult {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return { spoken: null, complete: false, displayText: markdown ?? '' };
  }

  // Fast bail-out: the spoken fence is rare in normal traffic, so skip the
  // multi-pass regex walk when neither fence marker with the `spoken` info
  // string is present anywhere in the body. Match is case-insensitive
  // (the model occasionally uppercases the info string).
  const lower = markdown.toLowerCase();
  if (!lower.includes('```spoken') && !lower.includes('~~~spoken')) {
    return { spoken: null, complete: false, displayText: markdown };
  }

  // The contract is "the LAST complete spoken block drives playback" but
  // ALL complete spoken blocks must be stripped from displayText — the
  // model occasionally re-emits a spoken block in a follow-up paragraph
  // (e.g. after a tool result) and we don't want a raw ```spoken fence
  // visible in the chat. The "last" wins for TTS because it's the
  // freshest summary.
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null = SPOKEN_RE.exec(markdown);
  while (match !== null) {
    matches.push(match);
    match = SPOKEN_RE.exec(markdown);
  }

  let displayText = markdown;
  if (matches.length > 0) {
    // Walk matches in REVERSE so the earlier indexes stay valid as we
    // splice. The last match is the one we expose as `spoken`.
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const m = matches[i]!;
      const start = m.index;
      const end = start + m[0].length;
      displayText = displayText.slice(0, start) + displayText.slice(end);
    }
  }

  // Handle an unterminated `spoken` fence at the very end of the body
  // (a streaming chunk that hasn't received its closing fence yet). We
  // find the LAST opening fence with the `spoken` info string that is
  // not part of a complete block and strip everything from its opening
  // line through the end of the body.
  displayText = stripUnterminatedSpokenFence(displayText);

  // Trim trailing blank lines so the markdown renderer doesn't emit a
  // stray empty paragraph. We don't trim leading whitespace — the model
  // may have intentionally indented.
  displayText = displayText.replace(/\r?\n[\s\u00a0]*$/u, '');

  const lastMatch = matches.length > 0 ? matches[matches.length - 1]! : null;
  return {
    // Normalize the captured body: the regex may include a trailing \r
    // on CRLF inputs, which we strip so consumers (TTS, copy button)
    // see clean text.
    spoken: lastMatch ? lastMatch[2]!.replace(/\r\n?/g, '\n') : null,
    complete: lastMatch !== null,
    displayText,
  };
}

/**
 * Remove an unterminated `spoken` fence (if any) at the end of the body.
 * Walks the string from the end and tracks fence state so we only strip
 * when the final opening `spoken` fence lacks a matching closer.
 */
function stripUnterminatedSpokenFence(text: string): string {
  // Walk through every fence marker in order. If a `spoken`-info opening
  // fence is the most recent unmatched fence at end-of-string, trim from
  // its opening line to the end. We do not use a regex here because the
  // state machine is easier to read line-by-line.
  const lines = text.split(/\r?\n/);
  let openFence: { marker: string; length: number } | null = null;
  let openFenceLine = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = parseFenceLine(line);
    if (!fence) continue;
    if (openFence === null) {
      // Opening fence
      if (fence.info === 'spoken') {
        openFence = { marker: fence.marker, length: fence.length };
        openFenceLine = i;
      } else {
        // Non-spoken fence; we don't track it. Bail — extractSpokenBlock
        // is only concerned with spoken blocks.
        break;
      }
    } else if (fence.marker === openFence.marker && fence.length >= openFence.length && fence.info === '') {
      // Closing fence
      openFence = null;
      openFenceLine = -1;
    }
  }

  if (openFence !== null && openFenceLine >= 0) {
    lines.length = openFenceLine;
    // Trim trailing blank lines that the closing fence would have left behind.
    while (lines.length > 0 && /^\s*$/u.test(lines[lines.length - 1]!)) {
      lines.pop();
    }
    return lines.join('\n');
  }
  return text;
}

type ParsedFence = {
  marker: '`' | '~';
  length: number;
  info: string;
};

const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^\s`~]*)/;

/**
 * Parse a single line for a CommonMark fence marker. Returns `null` if
 * the line is not a fence line. `info` is the (lowercased) info string
 * after the marker, with surrounding whitespace stripped.
 */
function parseFenceLine(line: string): ParsedFence | null {
  const match = FENCE_RE.exec(line);
  if (!match) return null;
  const markerChars = match[1]!;
  const marker = markerChars[0] === '`' ? '`' : '~';
  return {
    marker,
    length: markerChars.length,
    info: (match[2] ?? '').toLowerCase(),
  };
}
