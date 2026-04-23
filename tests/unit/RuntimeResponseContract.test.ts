/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createRuntimeResponseContractState,
  denyForbiddenPreArtifactTools,
  finalizeRuntimeResponseContract,
} from '../../src/process/task/RuntimeResponseContract';

const CANARY_PROMPT =
  'Review this quarter for an existing endowment policy: equities outperformed, private marks lag, PE NAV rose above the policy range because public markets fell, spending reserve is down to 14 months, and the hedge fund sleeve underperformed its custom benchmark.';

const VALID_PACKET = [
  '# Senior PM Portfolio Construction Packet',
  '',
  '## Known Facts',
  'Equities outperformed.',
  '',
  '## Measurement',
  'Measure each sleeve against policy.',
  '',
  '## Attribution',
  'Separate public equity effects from hedge fund benchmark effects.',
  '',
  '## Appraisal',
  'Do not infer manager skill without more evidence.',
  '',
  '## Implementation And Rebalancing',
  'Treat PE NAV as a policy-range check item.',
  '',
  '## Monitoring Dashboard',
  'Track reserve months, PE range, hedge fund benchmark, and liquidity.',
  '',
  '## Bottom Line',
  'Escalate policy checks without inventing a floor breach.',
].join('\n');

function activeState() {
  return createRuntimeResponseContractState({
    assistantId: 'custom-1776969323991',
    prompt: CANARY_PROMPT,
    isFirstTurn: true,
  });
}

describe('RuntimeResponseContract', () => {
  it('activates only for Portfolio Review OS first-turn monitoring prompts', () => {
    expect(activeState().active).toBe(true);
    expect(
      createRuntimeResponseContractState({
        assistantId: 'custom-other',
        prompt: CANARY_PROMPT,
        isFirstTurn: true,
      }).active
    ).toBe(false);
    expect(
      createRuntimeResponseContractState({
        assistantId: 'custom-1776969323991',
        prompt: CANARY_PROMPT,
        isFirstTurn: false,
      }).active
    ).toBe(false);
  });

  it('passes a valid senior PM monitoring packet', () => {
    const result = finalizeRuntimeResponseContract(activeState(), VALID_PACKET);
    expect(result.status).toBe('passed');
    expect(result.visibleText).toBe(VALID_PACKET);
    expect(result.errors).toEqual([]);
  });

  it('safely crops narration only when no forbidden pre-artifact tool occurred', () => {
    const result = finalizeRuntimeResponseContract(activeState(), `I should inspect skills first.\n\n${VALID_PACKET}`);
    expect(result.status).toBe('repaired');
    expect(result.visibleText.startsWith('# Senior PM Portfolio Construction Packet')).toBe(true);

    const cropResult = finalizeRuntimeResponseContract(activeState(), `Some wrapper text\n\n${VALID_PACKET}`);
    expect(cropResult.status).toBe('repaired');
    expect(cropResult.visibleText.startsWith('# Senior PM Portfolio Construction Packet')).toBe(true);
  });

  it('blocks hidden reasoning tags and generic closeout wrappers', () => {
    const result = finalizeRuntimeResponseContract(activeState(), `<think>hidden</think>\n${VALID_PACKET}\n\nBrief`);
    expect(result.status).toBe('blocked');
    expect(result.errors.join('\n')).toMatch(/forbidden visible pattern/);
    expect(result.visibleText).toContain('# Portfolio Construction Input Scaffold');
  });

  it('denies forbidden pre-artifact workspace tools and blocks instead of cropping', () => {
    const state = activeState();
    const denied = denyForbiddenPreArtifactTools(state, [
      {
        callId: 'call-1',
        name: 'Read',
        description: 'Read a workspace file',
        renderOutputAsMarkdown: false,
        status: 'Confirming',
      },
    ]);

    expect(denied).toHaveLength(1);
    const result = finalizeRuntimeResponseContract(state, `Some wrapper text\n\n${VALID_PACKET}`);
    expect(result.status).toBe('blocked');
    expect(result.errors).toContain('forbidden pre-artifact tool/search occurred before a valid artifact');
  });
});
