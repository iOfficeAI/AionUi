import type { AcpConfigOptionDto, GetConfigOptionsResponse } from '@/common/types/platform/acpTypes';
import type {
  AcpConfigOptionBlocker,
  AcpConfigOptionSetter,
  AcpConfigOptionsLoader,
} from '@/renderer/hooks/agent/useAcpConfigOptions';

type TeamConfigOptionsLoad = (conversation_id: string) => Promise<AcpConfigOptionDto[] | null>;

export type TeamConfigOptionsLoader = AcpConfigOptionsLoader & {
  load: TeamConfigOptionsLoad;
  warmup: () => Promise<void>;
};

type CreateTeamConfigOptionsLoaderArgs = {
  team_id: string;
  warmupSession: () => Promise<void>;
  getConfigOptions: (team_id: string, conversation_id: string) => Promise<GetConfigOptionsResponse>;
  setConfigOption?: AcpConfigOptionSetter;
  isConfigOptionBlocked?: AcpConfigOptionBlocker;
};

export function createTeamConfigOptionsLoader({
  team_id,
  warmupSession,
  getConfigOptions,
  setConfigOption,
  isConfigOptionBlocked,
}: CreateTeamConfigOptionsLoaderArgs): TeamConfigOptionsLoader {
  let warmupPromise: Promise<void> | null = null;

  const warmup = () => {
    if (!warmupPromise) {
      warmupPromise = warmupSession().catch((error) => {
        warmupPromise = null;
        throw error;
      });
    }
    return warmupPromise;
  };

  const load: TeamConfigOptionsLoad = async (conversation_id: string) => {
    const response = await getConfigOptions(team_id, conversation_id);
    return response.config_options ?? null;
  };

  return Object.assign(load, { load, warmup, setConfigOption, isConfigOptionBlocked });
}
