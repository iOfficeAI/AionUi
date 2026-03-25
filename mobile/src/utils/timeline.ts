/**
 * Timeline utility functions for conversation history grouping
 * Ported from src/renderer/utils/timeline.ts
 */

import type { Conversation } from '../context/ConversationContext';

/**
 * Calculate the difference in days between two timestamps
 */
export const diffDay = (time1: number, time2: number): number => {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  const ymd1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const ymd2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diff = Math.abs(ymd2.getTime() - ymd1.getTime());
  return diff / (1000 * 60 * 60 * 24);
};

/**
 * Get the activity time (most recent) from a conversation
 */
export const getActivityTime = (conversation: Conversation): number => {
  return conversation.modifyTime || conversation.createTime || 0;
};

/**
 * Get the timeline label for a given timestamp
 */
export const getTimelineLabel = (time: number, currentTime: number, t: (key: string) => string): string => {
  const daysDiff = diffDay(currentTime, time);

  if (daysDiff === 0) return t('workspace.today');
  if (daysDiff === 1) return t('workspace.yesterday');
  if (daysDiff < 7) return t('workspace.recent7Days');
  return t('workspace.earlier');
};
