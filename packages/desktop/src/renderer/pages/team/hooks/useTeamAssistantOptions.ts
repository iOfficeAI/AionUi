import { useMemo } from 'react';
import { resolveLocaleKey } from '@/common/utils';
import { useConversationAssistants } from '@renderer/pages/conversation/hooks/useConversationAssistants';
import {
  assistantToOption,
  filterTeamSupportedAssistants,
  type TeamAssistantOption,
} from '../components/assistantSelectUtils';

export function useTeamAssistantOptions(locale = 'en-US'): {
  assistants: TeamAssistantOption[];
  loading: boolean;
  error: unknown;
  filterByQuery: (query: string) => TeamAssistantOption[];
} {
  const result = useConversationAssistants() as {
    presetAssistants?: Parameters<typeof assistantToOption>[0][];
    loading?: boolean;
    isLoading?: boolean;
    error?: unknown;
  };
  const localeKey = resolveLocaleKey(locale);
  const assistants = useMemo(
    () =>
      filterTeamSupportedAssistants(
        (result.presetAssistants ?? []).map((assistant) => assistantToOption(assistant, localeKey))
      ),
    [result.presetAssistants, localeKey]
  );
  const filterByQuery = useMemo(
    () => (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return assistants;
      return assistants.filter((assistant) => assistant.name.toLowerCase().includes(q));
    },
    [assistants]
  );

  return {
    assistants,
    loading: Boolean(result.loading ?? result.isLoading),
    error: result.error,
    filterByQuery,
  };
}
