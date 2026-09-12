/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseWalkthrough,
  stripWalkthrough,
  hasWalkthrough,
  classifySectionType,
  cleanWalkthroughForClipboard,
} from '@/renderer/pages/conversation/Messages/components/WalkthroughCard/walkthroughParser';

describe('walkthroughParser', () => {
  const sampleExplicitWalkthrough = `Here is the summary of the work done:

[WALKTHROUGH]
# Walkthrough: Ditado Local com Parakeet TDT v3 no AionUi

Guia completo e organizado sobre a nova funcionalidade de **Ditado Local**.

## 1. O que foi Entregue
- Modelo de IA Parakeet TDT v3 quantizado INT8
- Integração no Chat com gravação de áudio

## 2. Como Funciona por Baixo dos Panos
Decodificação de áudio em PCM 16kHz mono enviada via IPC.

## 3. Como Usar no Dia a Dia
1. Abra as Configurações
2. Selecione Local (Offline - Parakeet TDT)

## 4. O que Prestar Atenção & Dicas Técnicas
> [!TIP]
> 100% offline e privado.
[/WALKTHROUGH]`;

  describe('classifySectionType', () => {
    it('classifies delivered sections across languages', () => {
      expect(classifySectionType('1. O que foi Entregue')).toBe('delivered');
      expect(classifySectionType('What was delivered')).toBe('delivered');
      expect(classifySectionType('Changes Made')).toBe('delivered');
      expect(classifySectionType('交付内容')).toBe('delivered');
    });

    it('classifies how it works sections across languages', () => {
      expect(classifySectionType('2. Como Funciona por Baixo dos Panos')).toBe('howItWorks');
      expect(classifySectionType('How It Works')).toBe('howItWorks');
      expect(classifySectionType('Architecture & Mechanics')).toBe('howItWorks');
      expect(classifySectionType('实现原理')).toBe('howItWorks');
    });

    it('classifies usage and testing sections across languages', () => {
      expect(classifySectionType('3. Como Usar no Dia a Dia')).toBe('usage');
      expect(classifySectionType('How to Test')).toBe('usage');
      expect(classifySectionType('Verification Steps')).toBe('usage');
      expect(classifySectionType('使用与验证')).toBe('usage');
    });

    it('classifies notes, caveats and tips sections across languages', () => {
      expect(classifySectionType('4. O que Prestar Atenção & Dicas Técnicas')).toBe('notes');
      expect(classifySectionType('Notes and Caveats')).toBe('notes');
      expect(classifySectionType('Important Tips & Warnings')).toBe('notes');
      expect(classifySectionType('注意事项')).toBe('notes');
    });

    it('falls back to custom for unrecognized titles', () => {
      expect(classifySectionType('5. Next Steps and PR Status')).toBe('custom');
    });
  });

  describe('hasWalkthrough', () => {
    it('returns true when explicit tag is present', () => {
      expect(hasWalkthrough(sampleExplicitWalkthrough)).toBe(true);
    });

    it('returns true for streaming/unclosed explicit tag', () => {
      expect(hasWalkthrough('Working on it...\n\n[WALKTHROUGH]\n# Partial walkthrough')).toBe(true);
    });

    it('returns true for implicit markdown section with at least 2 structured subheadings', () => {
      const markdown = `Tudo pronto!
# Walkthrough: User Authentication
## Delivered Changes
- Auth service
## How to Test
- Run tests`;
      expect(hasWalkthrough(markdown)).toBe(true);
    });

    it('returns false when no walkthrough exists', () => {
      expect(hasWalkthrough('Just normal chat message')).toBe(false);
      expect(hasWalkthrough('')).toBe(false);
    });

    it('returns false for casual mention of the word walkthrough without structure', () => {
      expect(hasWalkthrough('Can you give me a walkthrough of how this code works?')).toBe(false);
    });
  });

  describe('parseWalkthrough', () => {
    it('parses explicit walkthrough block completely', () => {
      const data = parseWalkthrough(sampleExplicitWalkthrough);
      expect(data).not.toBeNull();
      expect(data?.title).toBe('Ditado Local com Parakeet TDT v3 no AionUi');
      expect(data?.summary).toContain('Guia completo e organizado');
      expect(data?.sections).toHaveLength(4);

      expect(data?.sections[0].type).toBe('delivered');
      expect(data?.sections[0].title).toBe('1. O que foi Entregue');
      expect(data?.sections[0].content).toContain('Parakeet TDT v3');

      expect(data?.sections[1].type).toBe('howItWorks');
      expect(data?.sections[1].content).toContain('PCM 16kHz mono');

      expect(data?.sections[2].type).toBe('usage');
      expect(data?.sections[2].content).toContain('Abra as Configurações');

      expect(data?.sections[3].type).toBe('notes');
      expect(data?.sections[3].content).toContain('100% offline e privado');
    });

    it('parses implicit markdown walkthrough', () => {
      const implicit = `Task completed!

# Walkthrough: Refactor State
## Delivered Changes
- Replaced Redux with Zustand
## How It Works
- Lightweight state store
## Verification
- Run bun run test`;

      const data = parseWalkthrough(implicit);
      expect(data).not.toBeNull();
      expect(data?.title).toBe('Refactor State');
      expect(data?.sections).toHaveLength(3);
      expect(data?.sections[0].type).toBe('delivered');
      expect(data?.sections[1].type).toBe('howItWorks');
      expect(data?.sections[2].type).toBe('usage');
    });

    it('returns null for empty or non-walkthrough content', () => {
      expect(parseWalkthrough('')).toBeNull();
      expect(parseWalkthrough('Just an answer')).toBeNull();
    });
  });

  describe('stripWalkthrough', () => {
    it('strips explicit walkthrough from message text', () => {
      const stripped = stripWalkthrough(sampleExplicitWalkthrough);
      expect(stripped).toBe('Here is the summary of the work done:');
      expect(stripped).not.toContain('[WALKTHROUGH]');
      expect(stripped).not.toContain('Parakeet TDT v3');
    });

    it('strips implicit walkthrough section from text', () => {
      const implicit = `Hello user!
Here are your results.

# Walkthrough: Feature X
## Delivered
- Done
## How to Test
- Test it`;

      const stripped = stripWalkthrough(implicit);
      expect(stripped).toBe('Hello user!\nHere are your results.');
      expect(stripped).not.toContain('Walkthrough: Feature X');
    });

    it('leaves normal text unchanged when no walkthrough is present', () => {
      const text = 'Normal text without any walkthrough.';
      expect(stripWalkthrough(text)).toBe(text);
    });
  });

  describe('cleanWalkthroughForClipboard', () => {
    it('removes tags while preserving markdown content', () => {
      const cleaned = cleanWalkthroughForClipboard(sampleExplicitWalkthrough);
      expect(cleaned).not.toContain('[WALKTHROUGH]');
      expect(cleaned).not.toContain('[/WALKTHROUGH]');
      expect(cleaned).toContain('# Walkthrough: Ditado Local');
      expect(cleaned).toContain('## 1. O que foi Entregue');
    });
  });
});
