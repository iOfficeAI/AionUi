import type { AcpConfigOptionDto, GetConfigOptionsResponse } from '@/common/types/platform/acpTypes';
import type {
  AcpConfigOptionBlocker,
  AcpConfigOptionSetter,
  AcpConfigOptionsPort,
} from '@/renderer/hooks/agent/useAcpConfigOptions';

type TeamConfigOptionsLoad = (conversation_id: string) => Promise<AcpConfigOptionDto[] | null>;

/**
 * A team member's config-options port. Reads and writes go through the team API
 * so the team service can apply its own gating — and persist a model switch onto
 * the member's roster entry — instead of the per-conversation endpoint.
 *
 * `warmup` is team-specific and deliberately NOT part of the shared port: it
 * brings the whole team session up, which callers reading a single member's
 * options do not want.
 */
export type TeamConfigOptionsPort = AcpConfigOptionsPort & {
  load: TeamConfigOptionsLoad;
  warmup: () => Promise<void>;
};

type CreateTeamConfigOptionsPortArgs = {
  team_id: string;
  warmupSession: () => Promise<void>;
  getConfigOptions: (team_id: string, conversation_id: string) => Promise<GetConfigOptionsResponse>;
  setConfigOption?: AcpConfigOptionSetter;
  isConfigOptionBlocked?: AcpConfigOptionBlocker;
};

export function createTeamConfigOptionsPort({
  team_id,
  warmupSession,
  getConfigOptions,
  setConfigOption,
  isConfigOptionBlocked,
}: CreateTeamConfigOptionsPortArgs): TeamConfigOptionsPort {
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

  return { load, warmup, setConfigOption, isConfigOptionBlocked };
}
