import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import type { CliSessionBackend, CliSessionSummary } from '@/common/types/cliSessionTypes';
import type { IConversationService } from '@process/services/IConversationService';
import { CliSessionService } from '@process/services/cliSessionService';
import { refreshTrayMenu } from '@process/utils/tray';

function isImportedCliConversation(
  conversation: TChatConversation,
  backend: CliSessionBackend,
  sessionId: string
): boolean {
  return (
    conversation.type === 'acp' &&
    conversation.extra?.backend === backend &&
    conversation.extra?.acpSessionId === sessionId
  );
}

async function refreshTrayMenuSafely(): Promise<void> {
  try {
    await refreshTrayMenu();
  } catch (error) {
    console.warn('[cliSessionBridge] Failed to refresh tray menu:', error);
  }
}

const IMPORTED_CLI_SESSION_MODEL: TProviderWithModel = {
  id: 'imported-cli-session',
  platform: 'openai',
  name: 'Imported CLI Session',
  baseUrl: '',
  apiKey: '',
  useModel: 'session-import',
};

function mergeImportedConversationIds(
  sessions: CliSessionSummary[],
  conversations: TChatConversation[]
): CliSessionSummary[] {
  return sessions.map((session) => {
    const existingConversation = conversations.find((conversation) =>
      isImportedCliConversation(conversation, session.backend, session.sessionId)
    );

    return existingConversation ? { ...session, conversationId: existingConversation.id } : session;
  });
}

export function initCliSessionBridge(conversationService: IConversationService): void {
  const cliSessionService = new CliSessionService();

  ipcBridge.cliSession.listRecent.provider(async ({ limit }) => {
    const [sessions, conversations] = await Promise.all([
      cliSessionService.listRecentSessions(limit),
      conversationService.listAllConversations(),
    ]);

    return mergeImportedConversationIds(sessions, conversations);
  });

  ipcBridge.cliSession.importConversation.provider(async ({ backend, sessionId }) => {
    const existingConversations = await conversationService.listAllConversations();
    const existingConversation = existingConversations.find((conversation) =>
      isImportedCliConversation(conversation, backend, sessionId)
    );

    if (existingConversation) {
      return existingConversation;
    }

    const session = await cliSessionService.findSession(backend, sessionId);
    if (!session) {
      throw new Error(`CLI session not found: ${backend}:${sessionId}`);
    }

    const conversation = await conversationService.createConversation({
      type: 'acp',
      name: session.title,
      model: IMPORTED_CLI_SESSION_MODEL,
      source: 'aionui',
      extra: {
        backend: session.backend,
        workspace: session.workspace,
        customWorkspace: Boolean(session.workspace),
        agentName: session.backend === 'claude' ? 'Claude Code' : 'Codex',
        acpSessionId: session.sessionId,
        acpSessionUpdatedAt: session.updatedAt,
      },
    });

    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action: 'created',
      source: conversation.source || 'aionui',
    });
    await refreshTrayMenuSafely();

    return conversation;
  });
}
