import { parseError } from '@/common/utils';
import type { AcpBackend } from '@/common/types/acpTypes';

type AcpUserErrorContext = {
  backend: AcpBackend;
  modelId?: string | null;
};

export const formatAcpUserErrorMessage = (error: unknown, context: AcpUserErrorContext): string => {
  const rawMessage = String(parseError(error));
  const target = `${context.backend}${context.modelId ? ` / ${context.modelId}` : ''}`;
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('429') || normalized.includes('rate limit')) {
    return `Request to ${target} was rate limited. Please wait a moment, switch to another model, or check your provider quota.\n\n${rawMessage}`;
  }

  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return `Request to ${target} timed out. The agent was stopped cleanly; please retry or increase the prompt timeout in settings.\n\n${rawMessage}`;
  }

  return rawMessage;
};
