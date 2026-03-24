/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { agentTeam as agentTeamBridge } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { getDatabase } from '@process/services/database';
import { getSystemDir } from '@process/utils/initStorage';
import { createAcpAgent, createGeminiAgent } from '@process/utils/initAgent';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import fs from 'fs/promises';
import path from 'path';
import type {
  IAgentTeamCreateResult,
  IAgentTeamSendMessageInput,
  ICoordTimelineEntry,
  ICreateAgentTeamInput,
  IResolvedAgentTeam,
} from './types';
import { CoordDispatcher } from './CoordDispatcher';

// --- Template generators for workspace assets ---

function getRelativeCoordDir(teamId: string): string {
  return `.agents/teams/${teamId}/coord`;
}

function generateTeamMd(teamName: string, members: Array<{ name: string; type: string; backend?: string; memberId: string }>, teamId: string): string {
  const memberLines = members.map((m) => `- **${m.name}** (type: ${m.type}${m.backend ? `, backend: ${m.backend}` : ''}, memberId: ${m.memberId})`).join('\n');
  return `# Agent Team: ${teamName}

## Members
${memberLines}

## Coordination
- Timeline: \`${getRelativeCoordDir(teamId)}/messages.jsonl\`
- Protocol: \`${getRelativeCoordDir(teamId)}/protocol.md\`
- Scripts: \`${getRelativeCoordDir(teamId)}/scripts/\`
- Attachments: \`${getRelativeCoordDir(teamId)}/attachments/\`
`;
}

function generateProtocolMd(): string {
  return EMBEDDED_COORD_PROTOCOL_MD;
}

function generateSkillMd(teamId: string): string {
  const cd = getRelativeCoordDir(teamId);
  return `---
name: coord-protocol
description: Agent Team coordination protocol - read/write coord messages, follow team rules
---

# Coord Protocol Skill

You are part of an Agent Team. Follow these rules strictly.

## Before Any Work
1. Read the team info: \`cat ${cd}/TEAM.md\`
2. Read the full protocol: \`cat ${cd}/protocol.md\`
3. Check for unread messages: \`python3 ${cd}/scripts/coord_read.py --messages ${cd}/messages.jsonl --state-dir ${cd}/state --agent-id <your-memberId>\`
4. Treat Agent Team wakeup messages as internal scheduler notices only. Never echo or quote those notices back into chat or coord.

## During Work
- Use \`intent\` or \`claim\` before implementation. If the work is exclusive, acquire a lock.
- Use \`challenge\` when you disagree with a proposal, finding, or decision. Do not hide disagreement inside \`update\`.
- Use \`--body-file\` for long content so the full content lands in \`${cd}/attachments/\`.
- Publish a \`design\` document before \`done\`.
- If \`/consensus\` is active, you MUST explicitly \`ack\` the final decision with \`--reply-to <decision-message-id>\` before ending.
- Every \`coord_write.py\` call MUST include \`--summary\`, even when you also pass \`--body\` or \`--body-file\`.

## Message Types
\`claim\`, \`intent\`, \`update\`, \`question\`, \`challenge\`, \`finding\`, \`design\`, \`decision\`, \`conclusion\`, \`ack\`, \`done\`

## Key Scripts
- Read: \`python3 ${cd}/scripts/coord_read.py --messages ${cd}/messages.jsonl --state-dir ${cd}/state --agent-id <memberId>\`
- Write: \`python3 ${cd}/scripts/coord_write.py --messages ${cd}/messages.jsonl --attachments-dir ${cd}/attachments --locks-dir ${cd}/locks --agent-id <memberId> --type <type> --summary "<summary>"\`
- Long content: \`python3 ${cd}/scripts/coord_write.py --messages ${cd}/messages.jsonl --attachments-dir ${cd}/attachments --locks-dir ${cd}/locks --agent-id <memberId> --type design --summary "<summary>" --body-file <path>\`
- Lock: \`python3 ${cd}/scripts/coord_write.py --messages ${cd}/messages.jsonl --attachments-dir ${cd}/attachments --locks-dir ${cd}/locks --agent-id <memberId> --type claim --summary "<summary>" --lock-key <key> --lock-action acquire\`
- Direct message (wake specific member only): add \`--dispatch targets --to <memberId>\`
- No-wakeup message (timeline only): add \`--dispatch none --to user\`
- Peek (without advancing cursor): add \`--peek\`
`;
}

function generatePresetPrompt(teamName: string, memberName: string, memberId: string, teamId: string): string {
  const cd = getRelativeCoordDir(teamId);
  return `You are member "${memberName}" (memberId: ${memberId}) of Agent Team "${teamName}".

Coordination rules:
- Read coord messages before acting: python3 ${cd}/scripts/coord_read.py --messages ${cd}/messages.jsonl --state-dir ${cd}/state --agent-id ${memberId}
- Treat Agent Team wakeup messages as internal scheduler notices only. Do not echo them into chat or coord.
- Write results back to coord with the correct message type, not only update.
- Every coord_write.py call must include --summary, even if you also use --body or --body-file.
- Use intent/claim before implementation. If work is mutually exclusive, acquire a lock first.
- If you disagree with a proposal, finding, or decision, send a challenge with evidence.
- If content is long, write it through --body-file so it becomes an attachment.
- Before done, publish a design document and attach it.
- If /consensus is active, you MUST explicitly ack the final decision with --reply-to <decision-message-id> before ending.
- Read ${cd}/TEAM.md for team members and ${cd}/protocol.md for full protocol.`;
}

function resolveDefaultSessionMode(member: ICreateAgentTeamInput['members'][number]): string {
  if (member.sessionMode) {
    return member.sessionMode;
  }
  if (member.type === 'gemini') {
    return 'yolo';
  }
  return member.backend === 'claude' ? 'bypassPermissions' : 'yolo';
}

const DEFAULT_GEMINI_MODEL: TProviderWithModel = {
  id: 'agent-team-gemini-placeholder',
  name: 'Gemini',
  platform: 'gemini-with-google-auth',
  baseUrl: '',
  apiKey: '',
  useModel: 'auto-gemini-3',
};

export class AgentTeamService {
  private dispatchers = new Map<string, CoordDispatcher>();

  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly conversationService: IConversationService,
    private readonly workerTaskManager: IWorkerTaskManager
  ) {}

  async createTeam(input: ICreateAgentTeamInput): Promise<IAgentTeamCreateResult> {
    if (!input.members.length) {
      throw new Error('Agent Team requires at least one member');
    }

    const { workspace, customWorkspace } = await this.resolveWorkspace(input.workspace, input.customWorkspace);
    const teamId = uuid();
    const coordDir = path.join(workspace, '.agents', 'teams', teamId, 'coord');
    const teamName = input.name || path.basename(workspace);

    // Pre-generate memberIds so we can inject them into presetContext/presetRules
    const memberDefs = input.members.map((m) => ({ ...m, memberId: uuid() }));

    // Ensure workspace with coord assets, TEAM.md, protocol.md, SKILL.md
    await this.ensureTeamWorkspace(coordDir, workspace, teamName, memberDefs, teamId);

    const memberConversations = await Promise.all(
      memberDefs.map((member) => this.createMemberConversation(member, workspace, customWorkspace, teamId, teamName, coordDir))
    );

    const members = memberConversations.map((conversation, index) => {
      const memberDef = memberDefs[index]!;
      return {
        memberId: memberDef.memberId,
        type: memberDef.type,
        backend: memberDef.backend,
        name: memberDef.name,
        conversationId: conversation.id,
        customAgentId: memberDef.customAgentId,
        presetAssistantId: memberDef.presetAssistantId,
      };
    });

    const teamConversation: Extract<TChatConversation, { type: 'agent-team' }> = {
      id: teamId,
      name: input.name || path.basename(workspace),
      createTime: Date.now(),
      modifyTime: Date.now(),
      type: 'agent-team',
      extra: {
        workspace,
        customWorkspace,
        coordDir,
        dispatchPolicy: input.dispatchPolicy || 'user-priority',
        defaultView: input.defaultView || 'timeline',
        members,
      },
      desc: customWorkspace ? workspace : '',
      source: 'aionui',
    };

    // Create team and member conversations
    {
      const teamResult = getDatabase().createConversation(teamConversation);
      if (!teamResult.success) {
        throw new Error(teamResult.error || 'Failed to create team conversation');
      }

      for (const conversation of memberConversations) {
        const memberResult = getDatabase().createConversation(conversation);
        if (!memberResult.success) {
          throw new Error(memberResult.error || `Failed to create member conversation ${conversation.id}`);
        }
      }
    }

    // Start coord dispatcher for this team
    this.startDispatcher(teamConversation);

    if (input.initialMessage?.trim() || (input.initialFiles && input.initialFiles.length > 0)) {
      await this.sendMessage({
        conversationId: teamConversation.id,
        input: input.initialMessage?.trim() || '',
        files: input.initialFiles,
      });
    }

    return {
      teamConversation,
      memberConversations,
    };
  }

  resumeAllTeams(): void {
    const teamConversations = this.conversationRepo
      .listAllConversations()
      .filter((conversation): conversation is Extract<TChatConversation, { type: 'agent-team' }> => {
        return conversation.type === 'agent-team';
      });

    for (const teamConversation of teamConversations) {
      this.startDispatcher(teamConversation);
    }
  }

  /** Start or resume dispatcher for a team (called on create and on app restart) */
  startDispatcher(teamConversation: Extract<TChatConversation, { type: 'agent-team' }>): void {
    if (this.dispatchers.has(teamConversation.id)) return;

    void this.syncTeamWorkspaceAssets(teamConversation);

    const dispatcher = new CoordDispatcher(
      teamConversation.extra.coordDir,
      teamConversation.extra.members,
      this.workerTaskManager,
      teamConversation.extra.dispatchPolicy,
      () => {
        void this.clearConsensusRequired(teamConversation.id);
      },
      (entries) => {
        for (const entry of entries) {
          agentTeamBridge.timelineStream.emit({
            conversation_id: teamConversation.id,
            entry,
          });
        }
      },
    );
    dispatcher.start();
    this.dispatchers.set(teamConversation.id, dispatcher);
  }

  /** Stop dispatcher for a team */
  stopDispatcher(teamId: string): void {
    const dispatcher = this.dispatchers.get(teamId);
    if (dispatcher) {
      dispatcher.stop();
      this.dispatchers.delete(teamId);
    }
  }

  async getTeam(conversationId: string): Promise<Extract<TChatConversation, { type: 'agent-team' }> | undefined> {
    const conversation = this.conversationRepo.getConversation(conversationId);
    if (!conversation || conversation.type !== 'agent-team') return undefined;
    return conversation;
  }

  async getMembers(conversationId: string): Promise<TChatConversation[]> {
    const team = await this.getTeam(conversationId);
    if (!team) return [];
    return team.extra.members
      .map((member) => this.conversationRepo.getConversation(member.conversationId))
      .filter((conversation): conversation is TChatConversation => Boolean(conversation));
  }

  async getTimeline(conversationId: string): Promise<ICoordTimelineEntry[]> {
    const team = await this.getResolvedTeam(conversationId);
    const messagesPath = path.join(team.teamConversation.extra.coordDir, 'messages.jsonl');
    const content = await fs.readFile(messagesPath, 'utf-8').catch(() => '');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ICoordTimelineEntry);
  }

  async sendMessage(input: IAgentTeamSendMessageInput): Promise<ICoordTimelineEntry> {
    const team = await this.getResolvedTeam(input.conversationId);
    const isConsensus = input.input.trim().startsWith('/consensus');
    const msgId = input.msgId || uuid();

    // Copy files to coord attachments
    let attachedFiles: string[] | undefined;
    if (input.files && input.files.length > 0) {
      const attachmentsDir = path.join(team.teamConversation.extra.coordDir, 'attachments');
      await fs.mkdir(attachmentsDir, { recursive: true });
      attachedFiles = [];
      for (const filePath of input.files) {
        try {
          const fileName = `${msgId}-${path.basename(filePath)}`;
          const dest = path.join(attachmentsDir, fileName);
          await fs.copyFile(filePath, dest);
          attachedFiles.push(dest);
        } catch {
          // Skip files that can't be copied
        }
      }
      if (attachedFiles.length === 0) attachedFiles = undefined;
    }

    // Use local timezone ISO format to match coord_write.py output (not UTC)
    const now = new Date();
    const tzOffset = -now.getTimezoneOffset();
    const sign = tzOffset >= 0 ? '+' : '-';
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
    const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(tzOffset / 60))}:${pad(tzOffset % 60)}`;

    const entry: ICoordTimelineEntry = {
      id: msgId,
      ts: localIso,
      from: 'user',
      role: 'user',
      type: isConsensus ? 'consensus' : 'message',
      summary: input.input.trim().slice(0, 120),
      body: input.input.trim(),
      topic: team.teamConversation.id,
      task_id: team.teamConversation.id,
      dispatch: 'all',
      to: ['*'],
      files: attachedFiles,
    };

    const messagesPath = path.join(team.teamConversation.extra.coordDir, 'messages.jsonl');
    await fs.appendFile(messagesPath, `${JSON.stringify(entry)}\n`, 'utf-8');

    if (isConsensus) {
      await this.conversationService.updateConversation(
        team.teamConversation.id,
        {
          extra: {
            ...team.teamConversation.extra,
            consensus: {
              required: true,
              decisionMessageId: entry.id,
              activeAgents: team.members.map((member) => member.conversationId),
            },
          },
        } as Partial<TChatConversation>,
        false
      );
    } else {
      await this.conversationService.updateConversation(team.teamConversation.id, {
        modifyTime: Date.now(),
      } as Partial<TChatConversation>);
    }

    return entry;
  }

  async deleteTeam(conversationId: string): Promise<void> {
    this.stopDispatcher(conversationId);
    const members = await this.getMembers(conversationId);
    for (const member of members) {
      this.workerTaskManager.kill(member.id);
      await this.conversationService.deleteConversation(member.id);
    }
    this.workerTaskManager.kill(conversationId);
    await this.conversationService.deleteConversation(conversationId);
  }

  private async getResolvedTeam(conversationId: string): Promise<IResolvedAgentTeam> {
    const teamConversation = await this.getTeam(conversationId);
    if (!teamConversation) {
      throw new Error(`Agent Team conversation not found: ${conversationId}`);
    }
    return {
      teamConversation,
      members: teamConversation.extra.members,
    };
  }

  private async clearConsensusRequired(conversationId: string): Promise<void> {
    const latestTeam = await this.getTeam(conversationId);
    if (!latestTeam?.extra.consensus?.required) {
      return;
    }

    await this.conversationService.updateConversation(
      conversationId,
      {
        extra: {
          ...latestTeam.extra,
          consensus: {
            ...latestTeam.extra.consensus,
            required: false,
          },
        },
      } as Partial<TChatConversation>,
      false,
    );
  }

  private async resolveWorkspace(workspace?: string, customWorkspace?: boolean): Promise<{
    workspace: string;
    customWorkspace: boolean;
  }> {
    if (workspace) {
      const resolved = path.resolve(workspace);
      await fs.mkdir(resolved, { recursive: true });
      return {
        workspace: resolved,
        customWorkspace: customWorkspace ?? true,
      };
    }

    const generated = path.join(getSystemDir().workDir, `agent-team-temp-${Date.now()}`);
    await fs.mkdir(generated, { recursive: true });
    return {
      workspace: generated,
      customWorkspace: false,
    };
  }

  private async ensureTeamWorkspace(
    coordDir: string,
    workspace: string,
    teamName: string,
    memberDefs: Array<{ name: string; type: string; backend?: string; memberId: string }>,
    teamId: string,
  ): Promise<void> {
    // Coord runtime directories
    await fs.mkdir(path.join(coordDir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(coordDir, 'attachments'), { recursive: true });
    await fs.mkdir(path.join(coordDir, 'locks'), { recursive: true });
    await fs.mkdir(path.join(coordDir, 'state'), { recursive: true });

    // Clean up legacy root-level discovery skill files (from before team-level isolation)
    for (const legacyDir of [
      path.join(workspace, '.claude', 'skills', 'coord-protocol'),
      path.join(workspace, '.gemini', 'skills', 'coord-protocol'),
    ]) {
      try {
        await fs.rm(legacyDir, { recursive: true, force: true });
      } catch {
        // Ignore if doesn't exist
      }
    }
    // Also clean up legacy root-level TEAM.md
    try {
      await fs.unlink(path.join(workspace, 'TEAM.md'));
    } catch {
      // Ignore
    }

    // messages.jsonl (append-only, don't overwrite)
    await fs.writeFile(path.join(coordDir, 'messages.jsonl'), '', { flag: 'a' });

    // protocol.md — formal coordination protocol
    await this.writeIfChanged(path.join(coordDir, 'protocol.md'), generateProtocolMd());

    // TEAM.md — inside team coord dir (not workspace root, to avoid multi-team overwrite)
    await fs.writeFile(path.join(coordDir, 'TEAM.md'), generateTeamMd(teamName, memberDefs, teamId), 'utf-8');

    // SKILL.md — per-team skill inside coord dir only (not workspace root CLI discovery dirs,
    // because multi-team on same workspace would overwrite each other. presetPrompt already
    // points agents to the correct team-specific paths.)
    const skillContent = generateSkillMd(teamId);
    await fs.writeFile(path.join(coordDir, 'SKILL.md'), skillContent, 'utf-8');

    // Write coord scripts into workspace (embedded, no external dependency)
    await this.writeCoordScripts(coordDir);
  }

  private async writeIfChanged(filePath: string, content: string): Promise<void> {
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      if (existing === content) {
        return;
      }
      await fs.writeFile(filePath, content, 'utf-8');
    } catch {
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  private async writeCoordScripts(coordDir: string): Promise<void> {
    const scriptsDst = path.join(coordDir, 'scripts');
    await this.writeIfChanged(path.join(scriptsDst, 'coord_read.py'), EMBEDDED_COORD_READ_PY);
    await this.writeIfChanged(path.join(scriptsDst, 'coord_write.py'), EMBEDDED_COORD_WRITE_PY);
  }

  private async syncTeamWorkspaceAssets(teamConversation: Extract<TChatConversation, { type: 'agent-team' }>): Promise<void> {
    const { workspace, coordDir, members } = teamConversation.extra;
    await this.ensureTeamWorkspace(
      coordDir,
      workspace,
      teamConversation.name,
      members.map((member) => ({
        name: member.name,
        type: member.type,
        backend: member.backend,
        memberId: member.memberId,
      })),
      teamConversation.id,
    );
  }

  private async createMemberConversation(
    member: ICreateAgentTeamInput['members'][number] & { memberId: string },
    workspace: string,
    customWorkspace: boolean,
    teamId: string,
    teamName: string,
    coordDir: string,
  ): Promise<Extract<TChatConversation, { type: 'gemini' }> | Extract<TChatConversation, { type: 'acp' }>> {
    const presetPrompt = generatePresetPrompt(teamName, member.name, member.memberId, teamId);

    if (member.type === 'gemini') {
      const geminiConversation = await createGeminiAgent(
        member.model || DEFAULT_GEMINI_MODEL,
        workspace,
        [],
        'google',
        customWorkspace,
        undefined,
        undefined,
        member.enabledSkills,
        member.presetAssistantId,
        resolveDefaultSessionMode(member),
      );
      return {
        ...geminiConversation,
        name: member.name,
        extra: {
          ...geminiConversation.extra,
          teamId,
          presetRules: presetPrompt,
        },
      } as Extract<TChatConversation, { type: 'gemini' }>;
    }

    const acpConversation = await createAcpAgent({
      type: 'acp',
      name: member.name,
      model: (member.model || DEFAULT_GEMINI_MODEL) as TProviderWithModel,
      extra: {
        workspace,
        customWorkspace,
        backend: (member.backend || 'claude') as any,
        cliPath: member.cliPath,
        agentName: member.name,
        customAgentId: member.customAgentId,
        enabledSkills: member.enabledSkills,
        presetAssistantId: member.presetAssistantId,
        presetContext: presetPrompt,
        sessionMode: resolveDefaultSessionMode(member),
        currentModelId: member.currentModelId,
      },
    });

    return {
      ...acpConversation,
      name: member.name,
      extra: {
        ...acpConversation.extra,
        teamId,
      },
    } as Extract<TChatConversation, { type: 'acp' }>;
  }
}

// --- Embedded coord scripts (self-contained, no external file dependency) ---

const EMBEDDED_COORD_PROTOCOL_MD = `# Multi-Agent Coordination Protocol

## Purpose

This protocol is for multi-agent coordination in a shared workspace.

Goals:

1. Read only new messages.
2. Keep messages short.
3. Move large content into attachment files.
4. Make mutually exclusive work explicit before editing.
5. Avoid returning to the user until agents either finish the task or jointly agree on a conclusion or blocker.
6. Allow the user to participate directly in the same coordination stream.
7. When the user explicitly requires consensus, enforce explicit multi-agent ACK before any agent returns to the user.

## Files

- Message stream: \`.agents/teams/<teamId>/coord/messages.jsonl\`
- Attachments: \`.agents/teams/<teamId>/coord/attachments/\`
- Reader state: \`.agents/teams/<teamId>/coord/state/<agent_id>.cursor.json\`
- Locks: \`.agents/teams/<teamId>/coord/locks/<lock_key>.json\`

## Roles

Participants are identified by \`from\` and described by \`role\`.

- \`system\`: protocol bootstrap or global notices
- \`user\`: product direction, priorities, corrections, acceptance signals
- \`agent\`: implementation, testing, critique, design, and delivery work

User messages are first-class inputs. Agents must respond to them seriously and explicitly. Agents should:

1. acknowledge the direction in the coordination stream,
2. evaluate it against evidence and constraints,
3. execute it objectively when sound, or
4. challenge it with concrete evidence when it is risky or incorrect.

Agents must not ignore user guidance, and must not flatter the user instead of doing objective engineering work.

## Message Rules

1. Append-only. Never rewrite old JSONL lines.
2. Every write should go through \`coord_write.py\`.
3. Every read should go through \`coord_read.py\`.
4. If a task is mutually exclusive, acquire a lock before starting work.
5. If content is longer than the inline threshold, store it as an attachment and only keep a short preview inline.
6. Development work is claim-based. Before starting implementation work, the agent should write \`intent\` or \`claim\`, and acquire a lock when the work is mutually exclusive.
7. After finishing development work, the agent must publish a design document and attach it in the coordination stream before marking the work as complete.
8. If the user says the team must reach consensus, no agent may stop at a private judgment. The team must continue until explicit ACK messages are exchanged on the same final conclusion.

## Required Fields

- \`id\`: unique message id
- \`ts\`: ISO timestamp
- \`from\`: writer agent id
- \`role\`: \`system\`, \`user\`, or \`agent\`
- \`to\`: \`["*"]\` or a list of target agent ids
- \`topic\`: topic or feature name, for example \`browser-debug\`
- \`task_id\`: optional task id
- \`type\`: one of \`claim\`, \`intent\`, \`update\`, \`question\`, \`challenge\`, \`finding\`, \`design\`, \`decision\`, \`conclusion\`, \`ack\`, \`done\`, \`system\`, \`direction\`
- \`summary\`: short message summary

## Optional Fields

- \`body\`: short inline detail
- \`attachment\`: object with \`path\`, \`bytes\`, \`sha256\`
- \`reply_to\`: message id being answered
- \`lock\`: object with \`key\`, \`action\`, \`status\`
- \`meta\`: free-form metadata
- \`consensus\`: object for consensus tracking, for example \`{"required": true, "status": "in_progress" | "reached", "decision_id": "<msg-id>" }\`
- \`dispatch\`: transport routing (\`all\` = broadcast and wake all members, \`targets\` = wake only members listed in \`to\`, \`none\` = append to timeline only, do not wake any agent). Default is \`all\`.

## Dispatch Rules

The \`dispatch\` field controls which agents are woken up when a message is appended:

- User messages always wake all agents regardless of \`dispatch\`.
- \`dispatch=all\`: wake every member except the sender. Use \`to: ["*"]\`.
- \`dispatch=targets\`: wake only the members listed in \`to\`. Use \`to: ["<memberId>", ...]\`.
- \`dispatch=none\`: do not wake any agent. Use \`to: ["user"]\`. The message is visible in the timeline but no agent is interrupted.

Use \`--dispatch\` flag with \`coord_write.py\` to set this field.

## Lock Rules

Use locks for mutually exclusive work such as:

- editing the same file
- changing the same integration point
- rewriting the same test
- implementing the same claimed development task

Lock actions:

- \`acquire\`
- \`release\`

Lock statuses:

- \`acquired\`
- \`released\`
- \`blocked\`

If a lock is blocked, the agent should not proceed with that exclusive task until it either:

1. coordinates a handoff, or
2. chooses a different task branch

Claimed development work should normally use the same \`task_id\` and \`lock.key\` so other agents can see who is actively changing that area.

## Reader Rules

Each agent has an independent cursor file.

\`coord_read.py\` reads only messages after that agent's last cursor position.

Default behavior:

1. read new messages
2. print compact summaries
3. advance the cursor

Use \`--peek\` to inspect without moving the cursor.

## Writer Rules

Use \`coord_write.py\` for every protocol write.

The writer script:

1. assigns ids and timestamps
2. enforces short summaries
3. moves long bodies into attachments
4. records lock acquire and release attempts
5. records the writer role

## Design Document Rule

Implementation is not complete when code lands. The claiming agent must publish a short design document after development and before \`done\`.

Minimum design document content:

1. problem statement
2. chosen approach
3. alternatives considered or rejected
4. affected files and interfaces
5. risks and follow-up checks
6. verification performed

Recommended path format:

- \`.agents/teams/<teamId>/coord/attachments/design-<task_id>-<agent_id>.md\`

The completion message should either:

1. use \`type=design\` and attach the design document, or
2. reference an earlier \`design\` message before sending \`done\`

## Collaboration Rule

After the user gives a task, agents should continue coordinating through this protocol and should not come back to the user until:

1. the task is completed, or
2. all active agents agree on the same blocker or conclusion

One agent disagreement means the task is not yet settled.

If the user explicitly says that agents must reach consensus, the task enters \`consensus-required\` mode. In this mode:

1. agents must keep working and exchanging evidence until a final \`decision\` or \`conclusion\` message exists,
2. every active agent must send an explicit \`ack\` that references that exact final message via \`reply_to\`,
3. the ACK must state whether the agent agrees, what evidence supports the agreement, or why it still disagrees,
4. no agent may return to the user before all active agents have ACKed the same final message,
5. silence is not agreement, and partial implementation is not completion,
6. if any active agent has not ACKed, the task is still open.

\`ack\` is not optional politeness. It is the protocol-level proof that consensus has been reached.

When a consensus-required task is active, agents must not:

1. stop after their own local conclusion,
2. report “done” before all active agents ACK the same conclusion,
3. treat “I already fixed my part” as completion,
4. drop back to the user for narration unless there is already a shared ACKed conclusion or a shared ACKed blocker.

When the user sends a \`direction\` message, the active agents should respond in-stream before continuing. At least one response should state:

1. what the user asked for,
2. whether the team accepts, adjusts, or challenges it, and
3. what concrete next action follows.

If the user's direction explicitly says “达成共识”, “共识后再来”, “直到都同意”, or equivalent intent, agents should immediately write:

1. an \`update\` or \`decision\` marking the task as \`consensus.required=true\`,
2. the planned investigation branches,
3. and later a chain of explicit \`ack\` messages that close the task.
`;

const EMBEDDED_COORD_READ_PY = `#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load_cursor(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return int(data.get("line", 0))
    except Exception:
        return 0


def save_cursor(path: Path, line_no: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"line": line_no}, ensure_ascii=True, indent=2) + "\\n", encoding="utf-8")


def should_show(msg: dict, agent_id: str, topic: str | None) -> bool:
    if topic and msg.get("topic") != topic:
        return False
    targets = msg.get("to") or ["*"]
    if "*" in targets:
        return True
    return agent_id in targets


def format_line(line_no: int, msg: dict) -> str:
    bits = [
        f"[{line_no}]",
        msg.get("ts", "?"),
        msg.get("from", "?"),
        f"role={msg.get('role', 'agent')}",
        msg.get("type", "?"),
    ]
    topic = msg.get("topic")
    if topic:
        bits.append(f"topic={topic}")
    task_id = msg.get("task_id")
    if task_id:
        bits.append(f"task={task_id}")
    summary = msg.get("summary", "")
    lock = msg.get("lock")
    if lock:
        bits.append(f"lock={lock.get('action')}:{lock.get('key')}:{lock.get('status')}")
    attachment = msg.get("attachment")
    if attachment:
        bits.append(f"attachment={attachment.get('path')}")
    if summary:
        bits.append(f"summary={summary}")
    return " | ".join(bits)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read only new coordination messages for one agent.")
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--messages", default=".agents/coord/messages.jsonl")
    parser.add_argument("--state-dir", default=".agents/coord/state")
    parser.add_argument("--topic")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--peek", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    messages_path = Path(args.messages)
    state_path = Path(args.state_dir) / f"{args.agent_id}.cursor.json"
    if not messages_path.exists():
        print("[]")
        return 0

    start_line = load_cursor(state_path)
    selected: list[tuple[int, dict]] = []

    with messages_path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            if line_no <= start_line:
                continue
            raw = raw.strip()
            if not raw:
                continue
            msg = json.loads(raw)
            if should_show(msg, args.agent_id, args.topic):
                selected.append((line_no, msg))

    if args.limit > 0:
        selected = selected[: args.limit]

    if args.json:
        print(json.dumps([{"line": line_no, "message": msg} for line_no, msg in selected], ensure_ascii=True, indent=2))
    else:
        for line_no, msg in selected:
            print(format_line(line_no, msg))

    if not args.peek and selected:
        save_cursor(state_path, selected[-1][0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const EMBEDDED_COORD_WRITE_PY = `#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def sanitize_key(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "lock"


def read_body(args: argparse.Namespace) -> str:
    if args.body_file:
        return Path(args.body_file).read_text(encoding="utf-8")
    return args.body or ""


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_attachment(base_dir: Path, msg_id: str, body: str, source_path: str | None) -> dict:
    ext = ".md"
    if source_path:
        suffix = Path(source_path).suffix
        if suffix:
            ext = suffix
    attachment_path = base_dir / f"{msg_id}{ext}"
    attachment_path.parent.mkdir(parents=True, exist_ok=True)
    attachment_path.write_text(body, encoding="utf-8")
    return {
        "path": str(attachment_path),
        "bytes": attachment_path.stat().st_size,
        "sha256": sha256_text(body),
    }


def manage_lock(locks_dir: Path, agent_id: str, key: str, action: str, summary: str, force: bool) -> dict:
    lock_path = locks_dir / f"{sanitize_key(key)}.json"
    locks_dir.mkdir(parents=True, exist_ok=True)
    if action == "none":
        return {}
    if action == "acquire":
        if lock_path.exists():
            current = json.loads(lock_path.read_text(encoding="utf-8"))
            if current.get("owner") != agent_id and not force:
                return {"key": key, "action": action, "status": "blocked", "owner": current.get("owner"), "path": str(lock_path)}
        data = {"owner": agent_id, "summary": summary, "updated_at": now_iso()}
        lock_path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\\n", encoding="utf-8")
        return {"key": key, "action": action, "status": "acquired", "path": str(lock_path)}
    if action == "release":
        if not lock_path.exists():
            return {"key": key, "action": action, "status": "released", "path": str(lock_path)}
        current = json.loads(lock_path.read_text(encoding="utf-8"))
        if current.get("owner") != agent_id and not force:
            return {"key": key, "action": action, "status": "blocked", "owner": current.get("owner"), "path": str(lock_path)}
        lock_path.unlink()
        return {"key": key, "action": action, "status": "released", "path": str(lock_path)}
    raise ValueError(f"Unknown lock action: {action}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Write a coordination message with optional attachment and lock handling.")
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--role", choices=["system", "user", "agent"], default="agent")
    parser.add_argument("--type", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--topic", default="general")
    parser.add_argument("--task-id", default="")
    parser.add_argument("--to", default="*")
    parser.add_argument("--body")
    parser.add_argument("--body-file")
    parser.add_argument("--messages", default=".agents/coord/messages.jsonl")
    parser.add_argument("--attachments-dir", default=".agents/coord/attachments")
    parser.add_argument("--locks-dir", default=".agents/coord/locks")
    parser.add_argument("--max-inline-chars", type=int, default=400)
    parser.add_argument("--reply-to", default="")
    parser.add_argument("--lock-key", default="")
    parser.add_argument("--lock-action", choices=["none", "acquire", "release"], default="none")
    parser.add_argument("--force-lock", action="store_true")
    parser.add_argument("--dispatch", choices=["all", "targets", "none"], default="all")
    args = parser.parse_args()

    msg_id = f"msg-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    body = read_body(args)

    attachment = None
    inline_body = body
    if body and len(body) > args.max_inline_chars:
        attachment = write_attachment(Path(args.attachments_dir), msg_id, body, args.body_file)
        inline_body = body[: args.max_inline_chars].rstrip() + "..."

    lock_info = manage_lock(Path(args.locks_dir), args.agent_id, args.lock_key, args.lock_action, args.summary, args.force_lock) if args.lock_key else {}

    msg = {
        "id": msg_id,
        "ts": now_iso(),
        "from": args.agent_id,
        "role": args.role,
        "to": [item.strip() for item in args.to.split(",") if item.strip()] or ["*"],
        "topic": args.topic,
        "task_id": args.task_id,
        "type": args.type,
        "summary": args.summary,
        "dispatch": args.dispatch,
    }
    if inline_body:
        msg["body"] = inline_body
    if attachment:
        msg["attachment"] = attachment
    if args.reply_to:
        msg["reply_to"] = args.reply_to
    if lock_info:
        msg["lock"] = lock_info

    messages_path = Path(args.messages)
    messages_path.parent.mkdir(parents=True, exist_ok=True)
    with messages_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(msg, ensure_ascii=True) + "\\n")

    print(json.dumps(msg, ensure_ascii=True, indent=2))
    if lock_info.get("status") == "blocked":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
