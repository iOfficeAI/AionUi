import type { AcpConfigOptionDto, GetConfigOptionsResponse } from '@/common/types/platform/acpTypes';

export type TeamConfigOptionsLoader = (conversation_id: string) => Promise<AcpConfigOptionDto[] | null>;

type CreateTeamConfigOptionsLoaderArgs = {
  team_id: string;
  warmupSession: () => Promise<void>;
  getConfigOptions: (team_id: string, conversation_id: string) => Promise<GetConfigOptionsResponse>;
};

export function createTeamConfigOptionsLoader({
  team_id,
  warmupSession,
  getConfigOptions,
}: CreateTeamConfigOptionsLoaderArgs): TeamConfigOptionsLoader {
  return async (conversation_id: string) => {
    await warmupSession();
    const response = await getConfigOptions(team_id, conversation_id);
    return response.config_options ?? null;
  };
}
