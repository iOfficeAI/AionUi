import { describe, expect, it } from 'vitest';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { createCodexAgent } from '@/process/utils/initAgent';

describe('createCodexAgent', () => {
  it('persists the selected native Codex model for first-session startup', async () => {
    const conversation = await createCodexAgent({
      type: 'codex',
      name: 'Codex',
      model: {} as TProviderWithModel,
      extra: {
        workspace: '/tmp/aionui-codex-workspace',
        customWorkspace: true,
        cliPath: '/usr/local/bin/codex',
        currentModelId: 'gpt-5.3-codex',
      },
    } as ICreateConversationParams);

    expect(conversation.extra).toMatchObject({
      codexModel: 'gpt-5.3-codex',
      currentModelId: 'gpt-5.3-codex',
    });
  });
});
