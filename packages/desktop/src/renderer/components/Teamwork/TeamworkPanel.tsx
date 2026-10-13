/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { teamwork } from '@/common/adapter/ipcBridge';
import type { TeamworkSessionState } from '@/common/types/teamwork';
import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import { InterviewView } from './InterviewView';
import { MilestoneTracker } from './MilestoneTracker';

export type TeamworkPanelProps = {
  conversation_id: string;
  workspace?: string;
};

export const TeamworkPanel: React.FC<TeamworkPanelProps> = ({ conversation_id, workspace }) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<TeamworkSessionState | null>(null);
  const [loading, setLoading] = useState(false);

  // Load initial session state
  const refreshState = useCallback(async () => {
    try {
      const res = await teamwork.getState({ conversationId: conversation_id });
      if (res.success && res.session) {
        setSession(res.session);
      }
    } catch (err) {
      console.warn('[TeamworkPanel] Failed to fetch state:', err);
    }
  }, [conversation_id]);

  useEffect(() => {
    void refreshState();

    // Subscribe to realtime status updates from the orchestrator
    const unsubscribe = teamwork.onStatusUpdate((updatedState) => {
      if (updatedState.conversationId === conversation_id) {
        setSession(updatedState);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversation_id, refreshState]);

  const handleSubmitInterview = async (answers: Record<string, string>) => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await teamwork.submitInterview({
        sessionId: session.sessionId,
        answers,
      });
      if (res.success && res.session) {
        setSession(res.session);
        Message.success(t('team.teamwork.planReadyTitle'));
      } else if (res.error) {
        Message.error(res.error);
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await teamwork.confirmPlan({
        sessionId: session.sessionId,
      });
      if (res.success && res.session) {
        setSession(res.session);
      } else if (res.error) {
        Message.error(res.error);
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAbort = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await teamwork.abort({
        sessionId: session.sessionId,
        reason: 'User cancelled',
      });
      if (res.success && res.session) {
        setSession(res.session);
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div data-testid='teamwork-panel' className={`${getChatSurfaceWidthClass()} shrink-0 px-2`}>
      {session.phase === 'interview' && (
        <InterviewView session={session} onSubmit={handleSubmitInterview} onAbort={handleAbort} loading={loading} />
      )}

      {(session.phase === 'scoping' ||
        session.phase === 'plan_ready' ||
        session.phase === 'executing' ||
        session.phase === 'verifying' ||
        session.phase === 'completed' ||
        session.phase === 'failed') && (
        <MilestoneTracker
          session={session}
          onConfirmPlan={session.phase === 'plan_ready' ? handleConfirmPlan : undefined}
          onAbort={session.phase === 'executing' || session.phase === 'verifying' ? handleAbort : undefined}
          loading={loading}
        />
      )}
    </div>
  );
};

export default TeamworkPanel;
