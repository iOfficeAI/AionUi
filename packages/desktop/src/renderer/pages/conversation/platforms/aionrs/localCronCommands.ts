/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICronAgentConfig, ICronJob } from '@/common/adapter/ipcBridge';
import { getFullAutoMode } from '@/common/types/agentModes';
import type { TChatConversation } from '@/common/config/storage';

type CronCreateParams = {
  kind: 'create';
  name: string;
  schedule: string;
  scheduleDescription: string;
  message: string;
};

type CronUpdateParams = {
  kind: 'update';
  jobId: string;
  name: string;
  schedule: string;
  scheduleDescription: string;
  message: string;
};

type CronListParams = {
  kind: 'list';
};

type CronDeleteParams = {
  kind: 'delete';
  jobId: string;
};

type CronCommand = CronCreateParams | CronUpdateParams | CronListParams | CronDeleteParams;

type LocalCronProcessingResult = {
  displayContent?: string;
  systemResponses: string[];
};

const THINK_TAG_RE = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
const CRON_CREATE_RE = /\[CRON_CREATE\]\s*([\s\S]*?)\s*\[\/CRON_CREATE\]/gi;
const CRON_UPDATE_RE = /\[CRON_UPDATE:\s*([^\]]+)\]\s*([\s\S]*?)\s*\[\/CRON_UPDATE\]/gi;
const CRON_LIST_RE = /\[CRON_LIST\]/gi;
const CRON_DELETE_RE = /\[CRON_DELETE:\s*([^\]]+)\]/gi;

function stripThinkTags(text: string): string {
  return text.replace(THINK_TAG_RE, '').trim();
}

function stripCronCommands(text: string): string {
  return text
    .replace(CRON_CREATE_RE, '')
    .replace(CRON_UPDATE_RE, '')
    .replace(CRON_LIST_RE, '')
    .replace(CRON_DELETE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCronCommandBody(body: string): {
  name?: string;
  schedule?: string;
  scheduleDescription?: string;
  message?: string;
} {
  const fields: {
    name?: string;
    schedule?: string;
    scheduleDescription?: string;
    message?: string;
  } = {};

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('name:')) {
      fields.name = line.slice('name:'.length).trim();
    } else if (line.startsWith('schedule_description:')) {
      fields.scheduleDescription = line.slice('schedule_description:'.length).trim();
    } else if (line.startsWith('schedule:')) {
      fields.schedule = line.slice('schedule:'.length).trim();
    } else if (line.startsWith('message:')) {
      fields.message = line.slice('message:'.length).trim();
    }
  }

  return fields;
}

function detectCronCommands(text: string): CronCommand[] {
  const commands: CronCommand[] = [];

  for (const match of text.matchAll(CRON_CREATE_RE)) {
    const body = match[1]?.trim();
    if (!body) continue;
    const parsed = parseCronCommandBody(body);
    if (!parsed.schedule) continue;
    commands.push({
      kind: 'create',
      name: parsed.name || 'Scheduled task',
      schedule: parsed.schedule,
      scheduleDescription: parsed.scheduleDescription || '',
      message: parsed.message || '',
    });
  }

  for (const match of text.matchAll(CRON_UPDATE_RE)) {
    const jobId = match[1]?.trim();
    const body = match[2]?.trim();
    if (!jobId || !body) continue;
    const parsed = parseCronCommandBody(body);
    if (!parsed.name || !parsed.schedule || !parsed.scheduleDescription || !parsed.message) continue;
    commands.push({
      kind: 'update',
      jobId,
      name: parsed.name,
      schedule: parsed.schedule,
      scheduleDescription: parsed.scheduleDescription,
      message: parsed.message,
    });
  }

  if (CRON_LIST_RE.test(text)) {
    commands.push({ kind: 'list' });
  }

  for (const match of text.matchAll(CRON_DELETE_RE)) {
    const jobId = match[1]?.trim();
    if (jobId) {
      commands.push({ kind: 'delete', jobId });
    }
  }

  return commands;
}

async function getConversation(conversationId: string): Promise<TChatConversation | undefined> {
  return ipcBridge.conversation.get.invoke({ id: conversationId });
}

function buildAgentConfig(conversation: TChatConversation | undefined): ICronAgentConfig {
  const workspace =
    typeof conversation?.extra?.workspace === 'string' && conversation.extra.workspace.trim()
      ? conversation.extra.workspace
      : '';

  return {
    backend: 'aionrs',
    name: 'aionrs',
    mode: getFullAutoMode('aionrs'),
    workspace,
  };
}

function formatJobList(jobs: ICronJob[]): string {
  if (jobs.length === 0) {
    return '📋 No scheduled tasks in this conversation.';
  }

  const items = jobs
    .map((job) => {
      const scheduleText = job.schedule.kind === 'cron' ? job.schedule.expr : job.schedule.description;
      const status = job.enabled ? '✓' : '✗';
      return `- [${status}] ${job.name} (${scheduleText}) - ID: ${job.id}`;
    })
    .join('\n');

  return `📋 Scheduled tasks:\n${items}`;
}

async function handleCronCommand(
  conversationId: string,
  conversation: TChatConversation | undefined,
  command: CronCommand
): Promise<string> {
  const agentConfig = buildAgentConfig(conversation);

  switch (command.kind) {
    case 'create': {
      const job = await ipcBridge.cron.addJob.invoke({
        name: command.name,
        schedule: {
          kind: 'cron',
          expr: command.schedule,
          description: command.scheduleDescription,
        },
        message: command.message,
        conversation_id: conversationId,
        conversation_title: conversation?.name,
        agent_type: 'aionrs',
        created_by: 'agent',
        execution_mode: 'existing',
        agent_config: agentConfig,
      });
      return `✅ Scheduled task created: "${job.name}" (ID: ${job.id})`;
    }
    case 'update': {
      const existing = await ipcBridge.cron.getJob.invoke({ job_id: command.jobId });
      if (!existing) {
        return `❌ Error: cron job not found: ${command.jobId}`;
      }

      const updatedTarget: ICronJob['target'] = {
        ...existing.target,
        payload: {
          kind: 'message',
          text: command.message,
        },
      };

      const updated = await ipcBridge.cron.updateJob.invoke({
        job_id: command.jobId,
        updates: {
          name: command.name,
          schedule: {
            kind: 'cron',
            expr: command.schedule,
            description: command.scheduleDescription,
          },
          target: updatedTarget,
          metadata: {
            ...existing.metadata,
            agent_config: {
              ...existing.metadata.agent_config,
              ...agentConfig,
            },
          },
        },
      });
      return `✅ Scheduled task updated: "${updated.name}" (ID: ${updated.id})`;
    }
    case 'list': {
      const jobs = await ipcBridge.cron.listJobsByConversation.invoke({ conversation_id: conversationId });
      return formatJobList(jobs);
    }
    case 'delete': {
      await ipcBridge.cron.removeJob.invoke({ job_id: command.jobId });
      return `🗑️ Scheduled task deleted: ${command.jobId}`;
    }
  }
}

export async function processLocalCronResponse(
  conversationId: string,
  rawContent: string
): Promise<LocalCronProcessingResult> {
  if (!rawContent.trim()) {
    return { systemResponses: [] };
  }

  const thinkStripped = stripThinkTags(rawContent);
  const commands = detectCronCommands(thinkStripped);
  if (commands.length === 0) {
    return {
      displayContent: thinkStripped !== rawContent ? thinkStripped : undefined,
      systemResponses: [],
    };
  }

  const conversation = await getConversation(conversationId);
  const systemResponses = await Promise.all(
    commands.map(async (command) => {
      try {
        return await handleCronCommand(conversationId, conversation, command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ Error: ${message}`;
      }
    })
  );

  return {
    displayContent: stripCronCommands(thinkStripped),
    systemResponses,
  };
}
