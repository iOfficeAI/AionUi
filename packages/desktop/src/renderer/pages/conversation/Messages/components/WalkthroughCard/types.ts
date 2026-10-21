/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type WalkthroughSectionType = 'delivered' | 'howItWorks' | 'usage' | 'notes' | 'custom';

export interface WalkthroughSection {
  id: string;
  type: WalkthroughSectionType;
  title: string;
  content: string;
}

export interface WalkthroughData {
  title: string;
  summary?: string;
  sections: WalkthroughSection[];
  rawContent: string;
}
