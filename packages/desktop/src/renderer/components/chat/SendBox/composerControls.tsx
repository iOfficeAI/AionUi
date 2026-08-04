import React, { type ReactNode } from 'react';

export type ConversationComposerControls = {
  attachment?: ReactNode;
  permission?: ReactNode;
  usage?: ReactNode;
  model?: ReactNode;
};

export type ConversationComposerControlSlots = {
  tools: ReactNode;
  rightTools: ReactNode;
};

/**
 * Owns the desktop conversation composer layout across runtime adapters.
 * Adapters provide capabilities; this shared seam decides where they render.
 */
export function createConversationComposerControlSlots({
  attachment,
  permission,
  usage,
  model,
}: ConversationComposerControls): ConversationComposerControlSlots {
  return {
    tools:
      attachment || permission ? (
        <div className='flex items-center gap-8px min-w-0'>
          {attachment}
          {permission}
        </div>
      ) : null,
    rightTools:
      usage || model ? (
        <div className='flex items-center gap-8px min-w-0'>
          {usage}
          {model}
        </div>
      ) : null,
  };
}
