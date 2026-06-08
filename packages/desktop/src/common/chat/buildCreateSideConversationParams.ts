/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

type SideCreateExtra = ICreateConversationParams['extra'] & {
  backend?: string;
  agent_name?: string;
  agent_id?: string;
  session_mode?: string;
  current_model_id?: string;
};

function resolveCreateType(parent: TChatConversation): ICreateConversationParams['type'] | null {
  switch (parent.type) {
    case 'acp':
      return 'acp';
    case 'aionrs':
      return parent.type;
    default:
      return null;
  }
}

/** Build `conversation.create` params for a forked side thread from a parent row. */
export function buildCreateSideConversationParams(
  parent: TChatConversation,
  forked_at_msg_id?: string
): ICreateConversationParams | null {
  const type = resolveCreateType(parent);
  if (!type) return null;

  const parentExtra = parent.extra;
  const createExtra: SideCreateExtra = {
    workspace: parentExtra.workspace,
    custom_workspace: parentExtra.custom_workspace,
    parent_conversation_id: parent.id,
    side_mode: true,
    ephemeral: true,
    side_guardrail: 'reference_readonly',
    forked_at_msg_id,
  };

  if (type === 'acp') {
    const acpExtra = parentExtra as { backend?: string; agent_name?: string; agent_id?: string; cli_path?: string };
    createExtra.backend = acpExtra.backend;
    if (acpExtra.agent_name) createExtra.agent_name = acpExtra.agent_name;
    if (acpExtra.agent_id) createExtra.agent_id = acpExtra.agent_id;
    if (acpExtra.cli_path) createExtra.cli_path = acpExtra.cli_path;
    if ('skills' in parentExtra && Array.isArray(parentExtra.skills)) {
      createExtra.preset_enabled_skills = [...parentExtra.skills];
    }
    if ('session_mode' in parentExtra && parentExtra.session_mode) {
      createExtra.session_mode = parentExtra.session_mode;
    }
    if ('current_model_id' in parentExtra && parentExtra.current_model_id) {
      createExtra.current_model_id = parentExtra.current_model_id;
    }
  } else if (type === 'aionrs') {
    const aionrsExtra = parentExtra as { skills?: string[]; session_mode?: string };
    if (aionrsExtra.skills?.length) createExtra.preset_enabled_skills = [...aionrsExtra.skills];
    if (aionrsExtra.session_mode) createExtra.session_mode = aionrsExtra.session_mode;
  }

  const model =
    'model' in parent && parent.model
      ? parent.model
      : {
          id: 'side-stub',
          platform: 'stub',
          name: 'stub',
          base_url: '',
          api_key: '',
          use_model: 'stub',
        };

  return {
    type,
    name: parent.name ? `↳ ${parent.name}` : 'Side',
    model,
    extra: createExtra,
  };
}
