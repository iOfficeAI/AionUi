/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createCommandEveLocalIntentClientToken,
  parseCommandEveLocalMarketingIntent,
} from '@renderer/pages/conversation/platforms/aionrs/commandEveLocalIntent';

describe('Command EVE local marketing intent parser', () => {
  it('returns null for non-slash and unrelated slash input', () => {
    expect(parseCommandEveLocalMarketingIntent('just a normal message')).toBeNull();
    expect(parseCommandEveLocalMarketingIntent('/help me')).toBeNull();
    expect(parseCommandEveLocalMarketingIntent('  ')).toBeNull();
  });

  it('parses /marketing into a card intent that plans dispatch but does NOT run the loop', () => {
    const intent = parseCommandEveLocalMarketingIntent('/marketing Launch teaser :: short body');
    expect(intent).not.toBeNull();
    expect(intent?.kind).toBe('marketing-card');
    expect(intent?.title).toBe('Launch teaser');
    expect(intent?.description).toBe('short body');
    expect(intent?.laneKey).toBe('research');
    expect(intent?.shouldPlanDispatch).toBe(true);
    // /marketing must NOT mark the loop verb.
    expect(intent?.shouldRunSafeLocalLoop).toBe(false);
  });

  it('parses /marketing-loop and marks the loop verb (chat still only chains create+dispatch-plan)', () => {
    const intent = parseCommandEveLocalMarketingIntent('/marketing-loop Q3 campaign');
    expect(intent).not.toBeNull();
    expect(intent?.title).toBe('Q3 campaign');
    expect(intent?.description).toBeUndefined();
    expect(intent?.laneKey).toBe('research');
    expect(intent?.shouldPlanDispatch).toBe(true);
    expect(intent?.shouldRunSafeLocalLoop).toBe(true);
  });

  it('accepts the /eve marketing-loop alias', () => {
    const intent = parseCommandEveLocalMarketingIntent('/eve marketing-loop Big idea');
    expect(intent?.title).toBe('Big idea');
    expect(intent?.shouldRunSafeLocalLoop).toBe(true);
  });

  it('splits title/description on the first newline when no :: is present', () => {
    const intent = parseCommandEveLocalMarketingIntent('/marketing Title line\nbody line one\nbody line two');
    expect(intent?.title).toBe('Title line');
    expect(intent?.description).toBe('body line one body line two');
  });

  it('returns null when the command has an empty payload', () => {
    expect(parseCommandEveLocalMarketingIntent('/marketing')).toBeNull();
    expect(parseCommandEveLocalMarketingIntent('/marketing-loop   ')).toBeNull();
  });

  it('clamps an over-long title to 120 chars', () => {
    const longTitle = 'x'.repeat(300);
    const intent = parseCommandEveLocalMarketingIntent(`/marketing ${longTitle}`);
    expect(intent?.title.length).toBe(120);
  });

  it('generates a stable, prefixed client token', () => {
    const token = createCommandEveLocalIntentClientToken();
    expect(token.startsWith('cmd-eve-chat-marketing-')).toBe(true);
    expect(createCommandEveLocalIntentClientToken()).not.toBe(token);
  });
});
