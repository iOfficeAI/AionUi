/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { processLocalCronResponse } from '@/renderer/pages/conversation/platforms/aionrs/localCronCommands';

describe('processLocalCronResponse', () => {
  it('keeps legacy cron command text visible instead of parsing it locally', async () => {
    const result = await processLocalCronResponse(
      'conversation-1',
      '<think>hidden planning</think>\n[CRON_CREATE]\nname: visible legacy text\n[/CRON_CREATE]'
    );

    expect(result).toEqual({
      displayContent: '[CRON_CREATE]\nname: visible legacy text\n[/CRON_CREATE]',
      systemResponses: [],
    });
  });
});
