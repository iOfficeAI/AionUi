/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WalkthroughData, WalkthroughSection, WalkthroughSectionType } from './types';

const EXPLICIT_TAG_REGEX = /\[WALKTHROUGH\]([\s\S]*?)(?:\[\/WALKTHROUGH\]|$)/i;

const IMPLICIT_HEADER_REGEX = /(?:^|\n)(#{1,2}\s+(?:Walkthrough|Resumo da Execução|Execution Walkthrough)[\s\S]*)$/i;

/**
 * Classify a section heading into one of the known semantic types
 * based on multilingual keywords (English, Portuguese, Chinese, Spanish, etc.).
 */
export function classifySectionType(heading: string): WalkthroughSectionType {
  const normalized = heading
    .toLowerCase()
    .replace(/^[\d.)\s\-#]+/, '')
    .trim();

  // 1. Delivered / Changes / What was done
  if (
    /\bdelivered\b|\bentregue\b|\bentregas?\b|\balterações\b|\balteracoes\b|\bchanges?\b|\bmodifi|\bwhat was done\b|\bo que foi feito\b|\bwhat changed\b|交付|纳品|сделано/i.test(
      normalized
    )
  ) {
    return 'delivered';
  }

  // 2. Notes / Attention / Watch out / Tips / Caveats (checked before howItWorks so "Dicas Técnicas" matches notes)
  if (
    /\bnotes?\b|\batenção\b|\batencao\b|\bwatch out\b|\btips?\b|\bdicas?\b|\bcaveats?\b|\bwarnings?\b|\balertas?\b|\bcuidados?\b|\bobservações\b|\bobservacoes\b|\bprestar atenção\b|\bprestar atencao\b|\bimportante\b|\bimportant\b|注意|注意事項|внимание/i.test(
      normalized
    )
  ) {
    return 'notes';
  }

  // 3. How it works / Architecture / Mechanics / Under the hood
  if (
    /\bhow it works?\b|\bcomo funciona\b|\barchitect|\barquitetura\b|\btechnical\b|\bdetalhes técnicos\b|\bdetalhes tecnicos\b|\bfuncionamento\b|\bmecanismo\b|\bunder the hood\b|\bpor baixo dos panos\b|原理|运作/i.test(
      normalized
    )
  ) {
    return 'howItWorks';
  }

  // 4. How to use / Usage / Testing / Verification / Steps
  if (
    /\bhow to use\b|\bcomo usar\b|\busage\b|\buso\b|\bhow to test\b|\btesting\b|\bcomo testar\b|\bverification\b|\bverificação\b|\bverificacao\b|\bpasso a passo\b|\bstep[- ]by[- ]step\b|\bquick start\b|\bgetting started\b|使用|検証|инструк/i.test(
      normalized
    )
  ) {
    return 'usage';
  }

  return 'custom';
}

/**
 * Parse a raw markdown block into structured WalkthroughData.
 */
function parseWalkthroughMarkdown(rawContent: string): WalkthroughData | null {
  const trimmed = rawContent.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n');
  let title = '';
  let contentStartIndex = 0;

  // Check if first line is a main header `# Title`
  const firstLine = lines[0]?.trim() ?? '';
  const titleMatch = firstLine.match(/^#\s+(.+)$/);
  if (titleMatch) {
    title = titleMatch[1].trim();
    // Clean "Walkthrough:" prefix if present
    title = title.replace(/^walkthrough\s*[:\-–—]\s*/i, '').trim();
    contentStartIndex = 1;
  }

  const remainingText = lines.slice(contentStartIndex).join('\n').trim();

  // Find all section headers (## or ###)
  const sectionHeadingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: Array<{ index: number; heading: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionHeadingRegex.exec(remainingText)) !== null) {
    headings.push({
      index: match.index,
      heading: match[2].trim(),
    });
  }

  let summary: string | undefined;
  const sections: WalkthroughSection[] = [];

  if (headings.length === 0) {
    // No subheadings — treating remaining text as content
    summary = remainingText || undefined;
    if (!summary) return null;
    sections.push({
      id: 'section-overview',
      type: 'custom',
      title: title || 'Overview',
      content: summary,
    });
  } else {
    // Summary is everything before the first heading
    const firstHeadingIndex = headings[0].index;
    if (firstHeadingIndex > 0) {
      const potentialSummary = remainingText
        .slice(0, firstHeadingIndex)
        .replace(/^---\s*$/gm, '')
        .trim();
      if (potentialSummary) {
        summary = potentialSummary;
      }
    }

    // Extract each section
    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const nextIndex = i + 1 < headings.length ? headings[i + 1].index : remainingText.length;
      const sectionFullText = remainingText.slice(current.index, nextIndex);

      // Remove the heading line itself to get the section content
      const firstNewline = sectionFullText.indexOf('\n');
      const sectionContent =
        firstNewline !== -1
          ? sectionFullText
              .slice(firstNewline + 1)
              .replace(/---+\s*$/m, '')
              .trim()
          : '';

      const sectionType = classifySectionType(current.heading);

      sections.push({
        id: `section-${i}-${sectionType}`,
        type: sectionType,
        title: current.heading,
        content: sectionContent,
      });
    }
  }

  return {
    title,
    summary,
    sections,
    rawContent: trimmed,
  };
}

/**
 * Check if the text contains a walkthrough block (either explicit tags or implicit markdown header).
 */
export function hasWalkthrough(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  if (EXPLICIT_TAG_REGEX.test(text)) return true;

  const match = text.match(IMPLICIT_HEADER_REGEX);
  if (!match) return false;

  // Validate that implicit header actually has at least 2 structured subsections
  const data = parseWalkthroughMarkdown(match[1]);
  if (!data || data.sections.length < 2) return false;

  const recognizedTypes = data.sections.filter((s) => s.type !== 'custom');
  return recognizedTypes.length >= 2;
}

/**
 * Parse walkthrough from message content.
 * Supports explicit [WALKTHROUGH]...[/WALKTHROUGH] and standard markdown walkthrough headings.
 */
export function parseWalkthrough(text: string): WalkthroughData | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Try explicit tag match first
  const explicitMatch = text.match(EXPLICIT_TAG_REGEX);
  if (explicitMatch && explicitMatch[1]?.trim()) {
    return parseWalkthroughMarkdown(explicitMatch[1].trim());
  }

  // 2. Fall back to implicit markdown section
  const implicitMatch = text.match(IMPLICIT_HEADER_REGEX);
  if (implicitMatch && implicitMatch[1]?.trim()) {
    const data = parseWalkthroughMarkdown(implicitMatch[1].trim());
    if (data && data.sections.length >= 2) {
      const recognized = data.sections.filter((s) => s.type !== 'custom');
      if (recognized.length >= 2) {
        return data;
      }
    }
  }

  return null;
}

/**
 * Strip walkthrough blocks from text so the regular message bubble renders cleanly without it.
 */
export function stripWalkthrough(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // 1. If explicit tags exist, strip them
  if (EXPLICIT_TAG_REGEX.test(text)) {
    return text
      .replace(EXPLICIT_TAG_REGEX, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // 2. If valid implicit walkthrough exists, strip it
  const implicitMatch = text.match(IMPLICIT_HEADER_REGEX);
  if (implicitMatch && hasWalkthrough(text)) {
    return text
      .slice(0, implicitMatch.index)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text;
}

/**
 * Strip explicit [WALKTHROUGH] tags for clipboard copying so it becomes clean readable markdown.
 */
export function cleanWalkthroughForClipboard(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\[\/?WALKTHROUGH\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
