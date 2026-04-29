/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationArtifact, IConversationArtifactStatus } from '@/common/adapter/ipcBridge';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ConversationArtifactContextValue = {
  artifacts: IConversationArtifact[];
  upsertArtifact: (artifact: IConversationArtifact) => void;
  updateArtifactStatus: (artifact_id: string, status: IConversationArtifactStatus) => void;
};

const ConversationArtifactContext = createContext<ConversationArtifactContextValue>({
  artifacts: [],
  upsertArtifact: () => {},
  updateArtifactStatus: () => {},
});

function upsertArtifacts(
  current: IConversationArtifact[],
  next: IConversationArtifact | IConversationArtifact[]
): IConversationArtifact[] {
  const incoming = Array.isArray(next) ? next : [next];
  if (!incoming.length) return current;

  const artifactById = new Map(current.map((artifact) => [artifact.id, artifact]));
  for (const artifact of incoming) {
    artifactById.set(artifact.id, artifact);
  }

  return Array.from(artifactById.values()).sort((a, b) => a.created_at - b.created_at);
}

export const useConversationArtifacts = (): IConversationArtifact[] =>
  useContext(ConversationArtifactContext).artifacts;

export const useUpsertConversationArtifact = (): ((artifact: IConversationArtifact) => void) =>
  useContext(ConversationArtifactContext).upsertArtifact;

export const useUpdateConversationArtifactStatus = (): ((
  artifact_id: string,
  status: IConversationArtifactStatus
) => void) => useContext(ConversationArtifactContext).updateArtifactStatus;

export const ConversationArtifactProvider: React.FC<React.PropsWithChildren<{ conversation_id: string }>> = ({
  conversation_id,
  children,
}) => {
  const [artifacts, setArtifacts] = useState<IConversationArtifact[]>([]);

  const upsertArtifact = useCallback((artifact: IConversationArtifact) => {
    setArtifacts((current) => upsertArtifacts(current, artifact));
  }, []);

  const updateArtifactStatus = useCallback((artifact_id: string, status: IConversationArtifactStatus) => {
    setArtifacts((current) =>
      current.map((artifact) =>
        artifact.id === artifact_id ? { ...artifact, status, updated_at: Date.now() } : artifact
      )
    );
  }, []);

  useEffect(() => {
    let alive = true;
    setArtifacts([]);

    void ipcBridge.conversation.listArtifacts
      .invoke({ conversation_id })
      .then((items) => {
        if (!alive) return;
        setArtifacts(upsertArtifacts([], items));
      })
      .catch((error) => {
        console.error('[ConversationArtifactProvider] Failed to load artifacts:', error);
      });

    return () => {
      alive = false;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (!conversation_id) return;

    return ipcBridge.conversation.artifactStream.on((artifact: IConversationArtifact) => {
      if (artifact.conversation_id !== conversation_id) return;
      upsertArtifact(artifact);
    });
  }, [conversation_id, upsertArtifact]);

  const value = useMemo<ConversationArtifactContextValue>(
    () => ({
      artifacts,
      upsertArtifact,
      updateArtifactStatus,
    }),
    [artifacts, upsertArtifact, updateArtifactStatus]
  );

  return <ConversationArtifactContext.Provider value={value}>{children}</ConversationArtifactContext.Provider>;
};
