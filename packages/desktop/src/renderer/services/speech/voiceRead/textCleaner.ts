/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Speakable-text extraction for the voice-read feature.
 *
 * Turns raw markdown (possibly mid-stream) into clean text that a TTS engine
 * can read aloud comfortably:
 * - think / skill-suggest blocks are dropped
 * - fenced code blocks collapse into a single "代码块" placeholder
 * - URLs, images, HTML tags, markdown markers and symbol-only lines are removed
 * - links keep their anchor text
 */

import { hasThinkTags, stripThinkTags } from '@/renderer/utils/chat/thinkTagFilter';
import { hasSkillSuggest, stripSkillSuggest } from '@/renderer/utils/chat/skillSuggestParser';

export const CODE_BLOCK_PLACEHOLDER = '代码块。';

export function cleanForSpeech(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // Mid-stream a think block may be unclosed; drop that tail FIRST — the
  // closed-block stripper below would remove the orphaned tag but keep the
  // "thinking" text. The lookahead ensures we only cut a think block that
  // never closes, so closed blocks keep the text that follows them.
  text = text.replace(/<\s*think(?:ing)?\s*>(?![\s\S]*<\s*\/\s*think)[\s\S]*$/i, '');
  if (hasThinkTags(text)) {
    text = stripThinkTags(text);
  }
  if (hasSkillSuggest(text)) {
    text = stripSkillSuggest(text);
  }

  // Fenced code blocks (including an unclosed tail fence while streaming).
  text = text.replace(/```[\s\S]*?(?:```|$)/g, `\n${CODE_BLOCK_PLACEHOLDER}\n`);
  text = text.replace(/~~~[\s\S]*?(?:~~~|$)/g, `\n${CODE_BLOCK_PLACEHOLDER}\n`);
  // Consecutive code blocks read as a single placeholder.
  text = text.replace(new RegExp(`(${CODE_BLOCK_PLACEHOLDER}\\s*){2,}`, 'g'), CODE_BLOCK_PLACEHOLDER);

  // Images and bare URLs are not speakable.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  // Markdown links keep their anchor text.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/https?:\/\/[^\s)>\]]+/gi, '');
  text = text.replace(/www\.[^\s)>\]]+/gi, '');

  // HTML tags.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');

  // Tables: drop separator rows, turn cell dividers into pauses.
  text = text.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ');
  text = text.replace(/\|/g, '，');

  // Heading / list / quote markers.
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');

  // Bold / italic / strikethrough markers; inline code keeps its text.
  text = text.replace(/(\*\*|__|\*|~~)/g, '');
  text = text.replace(/`([^`]*)`/g, '$1');

  // Horizontal rules.
  text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '');

  // Symbol-only lines (button glyphs, decorative separators).
  text = text.replace(/^[^\p{L}\p{N}]+$/gmu, ' ');

  // Collapse stuttered punctuation and extra whitespace.
  text = text.replace(/([。！？!?，,、；;：:~～—…-])\1{2,}/g, '$1$1');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Split raw markdown into paragraphs (fence-aware) and return each paragraph
 * as cleaned speakable text. Empty paragraphs are dropped.
 */
export function splitParagraphsForSpeech(raw: string): string[] {
  if (!raw) return [];

  const blocks: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;

  const pushBuf = () => {
    if (buf.length) {
      blocks.push(buf.join('\n'));
      buf = [];
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      if (fence) {
        // Closing fence: the code block becomes its own paragraph.
        buf.push(line);
        pushBuf();
        fence = null;
      } else {
        pushBuf();
        buf.push(line);
        fence = fenceMatch[1];
      }
      continue;
    }
    if (!fence && !line.trim()) {
      pushBuf();
      continue;
    }
    buf.push(line);
  }
  pushBuf();

  return blocks.map(cleanForSpeech).filter((block) => block.length > 0);
}
