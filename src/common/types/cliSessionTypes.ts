import type { AcpBackend } from './acpTypes';

export type CliSessionBackend = Extract<AcpBackend, 'claude' | 'codex'>;

export type CliSessionSummary = {
  sessionId: string;
  backend: CliSessionBackend;
  title: string;
  preview?: string;
  workspace?: string;
  workspaceExists: boolean;
  sourcePath: string;
  createdAt: number;
  updatedAt: number;
  conversationId?: string;
};
