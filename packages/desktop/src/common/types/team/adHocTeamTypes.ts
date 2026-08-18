// Ad-hoc team types shared between main process and renderer.

import type { TTeam, WorkspaceMode } from './teamTypes';

export type IAdHocTeamFromConversationParams = {
  conversation_id: string;
  user_id: string;
  /** The assistant to add as a teammate. */
  target_assistant_id?: string;
  /** Optional team display name; backend falls back to a generated name. */
  name?: string;
  /** Workspace sharing strategy for the created team. */
  workspace_mode?: WorkspaceMode;
};

export type IAdHocTeamByConversationParams = {
  conversation_id: string;
  user_id: string;
};

export type TAdHocTeamCreateResult = {
  team_id: string;
  origin_conversation_id: string;
  leader_slot_id: string;
  /** The newly added or reused teammate slot_id. */
  target_slot_id?: string;
  /** The assistant selected to join the team. */
  target_assistant_id?: string;
  /** Display name of the selected assistant for user-facing feedback. */
  target_assistant_name?: string;
  /** Whether a new team was created (true) or an existing one reused (false). */
  created: boolean;
};

export type TAdHocTeamAssociation = {
  team_id: string;
  origin_conversation_id: string;
  status: 'active' | 'disbanded';
  /** Included to help the frontend decide whether to show the status card. */
  team?: TTeam;
};
