/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import type { TeamMemory, TeamMemorySkill, TTeam } from '@/common/types/team/teamTypes';
import { loadAllConversationMessagesPaged } from '@/renderer/utils/chat/messagePagination';
import { emitter } from '@/renderer/utils/emitter';

function isTextMessage(message: TMessage): message is IMessageText {
  return message.type === 'text' && typeof (message as IMessageText).content?.content === 'string';
}

const TEAM_MEMORY_KEY_PREFIX = 'team-memory-';
const TEAM_AGENT_MEMORY_KEY_PREFIX = 'team-agent-memory-';
const TEAM_TASK_INJECTED_KEY_PREFIX = 'team-task-injected-';

export function getTeamMemoryStorageKey(teamId: string): string {
  return `${TEAM_MEMORY_KEY_PREFIX}${teamId}`;
}

export function getAgentMemoryStorageKey(teamId: string, slotId: string): string {
  return `${TEAM_AGENT_MEMORY_KEY_PREFIX}${teamId}-${slotId}`;
}

export function getTaskInjectedStorageKey(teamId: string): string {
  return `${TEAM_TASK_INJECTED_KEY_PREFIX}${teamId}`;
}

/**
 * Retrieve persistent memory (skills and system directives) for a team.
 */
export function getTeamMemory(teamId: string): TeamMemory {
  if (!teamId) {
    return { teamId: '', skills: [], systemDirectives: [] };
  }
  try {
    const raw = localStorage.getItem(getTeamMemoryStorageKey(teamId));
    if (!raw) {
      return { teamId, skills: [], systemDirectives: [] };
    }
    const parsed = JSON.parse(raw) as Partial<TeamMemory>;
    return {
      teamId,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      systemDirectives: Array.isArray(parsed.systemDirectives) ? parsed.systemDirectives : [],
    };
  } catch (error) {
    console.warn('[teamMemory] Failed to read team memory from localStorage:', error);
    return { teamId, skills: [], systemDirectives: [] };
  }
}

/**
 * Save persistent memory for a team.
 */
export function saveTeamMemory(teamId: string, memory: TeamMemory): void {
  if (!teamId) return;
  try {
    localStorage.setItem(getTeamMemoryStorageKey(teamId), JSON.stringify(memory));
  } catch (error) {
    console.warn('[teamMemory] Failed to persist team memory to localStorage:', error);
  }
}

/**
 * Append new skills and directives to a team's memory without duplicates.
 */
export function appendTeamMemory(
  teamId: string,
  newSkills: Array<Omit<TeamMemorySkill, 'id' | 'extractedAt'> | TeamMemorySkill>,
  newDirectives: string[]
): TeamMemory {
  const current = getTeamMemory(teamId);
  const now = Date.now();

  const existingTitles = new Set(current.skills.map((s) => s.title.trim().toLowerCase()));
  const mergedSkills = [...current.skills];

  for (const skill of newSkills) {
    const trimmedTitle = skill.title?.trim() ?? '';
    const trimmedDesc = skill.description?.trim() ?? '';
    if (!trimmedTitle || !trimmedDesc) continue;

    const lowerTitle = trimmedTitle.toLowerCase();
    if (!existingTitles.has(lowerTitle)) {
      existingTitles.add(lowerTitle);
      mergedSkills.push({
        id: 'id' in skill && skill.id ? skill.id : uuid(),
        title: trimmedTitle,
        description: trimmedDesc,
        extractedAt: 'extractedAt' in skill && skill.extractedAt ? skill.extractedAt : now,
      });
    }
  }

  const existingDirectives = new Set(current.systemDirectives.map((d) => d.trim().toLowerCase()));
  const mergedDirectives = [...current.systemDirectives];

  for (const directive of newDirectives) {
    const trimmed = directive?.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!existingDirectives.has(lower)) {
      existingDirectives.add(lower);
      mergedDirectives.push(trimmed);
    }
  }

  const updated: TeamMemory = {
    teamId,
    skills: mergedSkills,
    systemDirectives: mergedDirectives,
  };

  saveTeamMemory(teamId, updated);
  return updated;
}

/**
 * Clear all retained skills and directives for a team.
 */
export function clearTeamMemory(teamId: string): void {
  if (!teamId) return;
  try {
    localStorage.removeItem(getTeamMemoryStorageKey(teamId));
    localStorage.removeItem(getTaskInjectedStorageKey(teamId));
  } catch (error) {
    console.warn('[teamMemory] Failed to clear team memory:', error);
  }
}

/**
 * Remove a specific skill from a team's memory.
 */
export function removeTeamSkill(teamId: string, skillId: string): TeamMemory {
  const current = getTeamMemory(teamId);
  const updated: TeamMemory = {
    ...current,
    skills: current.skills.filter((s) => s.id !== skillId),
  };
  saveTeamMemory(teamId, updated);
  return updated;
}

/**
 * Remove a specific directive from a team's memory by index.
 */
export function removeTeamDirective(teamId: string, index: number): TeamMemory {
  const current = getTeamMemory(teamId);
  const updated: TeamMemory = {
    ...current,
    systemDirectives: current.systemDirectives.filter((_, i) => i !== index),
  };
  saveTeamMemory(teamId, updated);
  return updated;
}

/**
 * Retrieve memory for an individual agent within a team.
 */
export function getAgentMemory(teamId: string, slotId: string): TeamMemory {
  if (!teamId || !slotId) {
    return { teamId, skills: [], systemDirectives: [] };
  }
  try {
    const raw = localStorage.getItem(getAgentMemoryStorageKey(teamId, slotId));
    if (!raw) return { teamId, skills: [], systemDirectives: [] };
    const parsed = JSON.parse(raw) as Partial<TeamMemory>;
    return {
      teamId,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      systemDirectives: Array.isArray(parsed.systemDirectives) ? parsed.systemDirectives : [],
    };
  } catch {
    return { teamId, skills: [], systemDirectives: [] };
  }
}

/**
 * Save memory for an individual agent within a team.
 */
export function saveAgentMemory(teamId: string, slotId: string, memory: TeamMemory): void {
  if (!teamId || !slotId) return;
  try {
    localStorage.setItem(getAgentMemoryStorageKey(teamId, slotId), JSON.stringify(memory));
  } catch (error) {
    console.warn('[teamMemory] Failed to persist agent memory to localStorage:', error);
  }
}

/**
 * Check whether the team memory has already been injected into the current task session.
 */
export function isTaskMemoryInjected(teamId: string): boolean {
  if (!teamId) return false;
  try {
    return localStorage.getItem(getTaskInjectedStorageKey(teamId)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark team memory as injected for the current task session.
 */
export function markTaskMemoryInjected(teamId: string): void {
  if (!teamId) return;
  try {
    localStorage.setItem(getTaskInjectedStorageKey(teamId), 'true');
  } catch {
    // ignore
  }
}

/**
 * Reset task memory injection flag so the next task prompt injects memory again.
 */
export function resetTaskMemoryInjected(teamId: string): void {
  if (!teamId) return;
  try {
    localStorage.removeItem(getTaskInjectedStorageKey(teamId));
  } catch {
    // ignore
  }
}

const MAX_INJECTED_SKILLS = 5;
const MAX_INJECTED_DIRECTIVES = 5;

/**
 * Format retained skills and directives into a lightweight system prompt section.
 * Caps entries to prevent token explosion on long-running team sessions.
 */
export function formatMemoryForPrompt(memory: TeamMemory): string {
  if (memory.skills.length === 0 && memory.systemDirectives.length === 0) {
    return '';
  }

  const sections: string[] = ['[Retained Team Skills & Operational Directives]'];
  sections.push(
    'The following reusable operational rules, tool configurations, and skills were learned from prior tasks and must be followed:'
  );

  if (memory.skills.length > 0) {
    sections.push('Key Learned Skills:');
    const skillsToInject = memory.skills.slice(0, MAX_INJECTED_SKILLS);
    for (const skill of skillsToInject) {
      sections.push(`• **${skill.title}**: ${skill.description}`);
    }
  }

  if (memory.systemDirectives.length > 0) {
    sections.push('System Directives:');
    const directivesToInject = memory.systemDirectives.slice(0, MAX_INJECTED_DIRECTIVES);
    for (const directive of directivesToInject) {
      sections.push(`• ${directive}`);
    }
  }

  return sections.join('\n');
}

/**
 * Inject retained skills into the prompt if not yet injected in the current task.
 */
export function injectRetainedSkillsIntoPrompt(teamId: string, input: string, force = false): string {
  if (!teamId) return input;
  const memory = getTeamMemory(teamId);
  if (memory.skills.length === 0 && memory.systemDirectives.length === 0) {
    return input;
  }

  if (!force && isTaskMemoryInjected(teamId)) {
    return input;
  }

  const memoryBlock = formatMemoryForPrompt(memory);
  if (!memoryBlock) return input;

  markTaskMemoryInjected(teamId);
  return `${memoryBlock}\n\n---\n${input}`;
}

const DISTILLATION_PROMPT = `
Analyze the preceding conversation across all agents. Identify and extract reusable operational rules, custom tool configurations, coding conventions, factual corrections, user preferences, and distinct problem-solving skills learned during this interaction. Output them as concise, structured bullet points or JSON skill definitions. Do not retain transient chat logs or task-specific intermediate outputs.

Please output a valid JSON object in the following format:
\`\`\`json
{
  "skills": [
    {
      "title": "Short descriptive title",
      "description": "Clear explanation of how to execute or apply this learned skill"
    }
  ],
  "systemDirectives": [
    "Specific operational rule, coding convention, or user preference"
  ]
}
\`\`\`
If no reusable skills or directives were learned, output:
\`\`\`json
{
  "skills": [],
  "systemDirectives": []
}
\`\`\`
`.trim();

/**
 * Heuristic fallback to extract skills and directives from conversation messages
 * when the LLM side-question is unavailable or returns an error.
 */
export function extractSkillsHeuristic(messages: TMessage[]): {
  skills: Array<{ title: string; description: string }>;
  systemDirectives: string[];
} {
  const skills: Array<{ title: string; description: string }> = [];
  const systemDirectives: string[] = [];

  const textMessages = messages.filter(isTextMessage).map((m) => ({
    role: m.position === 'right' ? 'user' : 'assistant',
    text: m.content.content.trim(),
  }));

  if (textMessages.length === 0) {
    return { skills, systemDirectives };
  }

  // Look for user instructions indicating preferences, rules, or corrections
  const rulePatterns = [
    /(?:always|never|make sure to|remember to|please use|prefer|ensure that|do not|don't)\s+([^.!?\n]+[.!?]?)/gi,
    /(?:rule|convention|instruction|preference):\s*([^.!?\n]+[.!?]?)/gi,
  ];

  for (const msg of textMessages) {
    if (msg.role === 'user') {
      for (const pattern of rulePatterns) {
        pattern.lastIndex = 0;
        let match = pattern.exec(msg.text);
        while (match !== null) {
          const directive = match[0].trim();
          if (directive.length >= 10 && directive.length <= 250) {
            if (!systemDirectives.includes(directive)) {
              systemDirectives.push(directive);
            }
          }
          match = pattern.exec(msg.text);
        }
      }
    }
  }

  // Look for assistant problem-solving summaries or code conventions
  const summaryMatches = textMessages
    .filter((m) => m.role === 'assistant')
    .filter((m) => m.text.includes('Summary') || m.text.includes('Solution') || m.text.includes('Convention'));

  for (const m of summaryMatches) {
    const lines = m.text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if ((trimmed.startsWith('- ') || trimmed.startsWith('* ')) && trimmed.length > 20 && trimmed.length < 200) {
        const item = trimmed.replace(/^[-*]\s+/, '').trim();
        const colonIndex = item.indexOf(':');
        if (colonIndex > 3 && colonIndex < 40) {
          const title = item.slice(0, colonIndex).replace(/\*\*/g, '').trim();
          const description = item.slice(colonIndex + 1).trim();
          if (title && description && !skills.some((s) => s.title === title)) {
            skills.push({ title, description });
          }
        }
      }
    }
  }

  return { skills, systemDirectives };
}

/**
 * Parse distillation output from LLM (JSON block or markdown).
 */
export function parseDistillationOutput(output: string): {
  skills: Array<{ title: string; description: string }>;
  systemDirectives: string[];
} {
  const result: { skills: Array<{ title: string; description: string }>; systemDirectives: string[] } = {
    skills: [],
    systemDirectives: [],
  };

  try {
    // 1. Try to find a JSON code block: ```json ... ```
    const jsonBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidateJson = jsonBlockMatch ? jsonBlockMatch[1] : output;

    // Try finding the first '{' and last '}'
    const firstBrace = candidateJson.indexOf('{');
    const lastBrace = candidateJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = candidateJson.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr) as {
        skills?: Array<{ title?: string; description?: string }>;
        systemDirectives?: string[];
      };

      if (Array.isArray(parsed.skills)) {
        for (const item of parsed.skills) {
          if (item?.title && item?.description) {
            result.skills.push({
              title: String(item.title).trim(),
              description: String(item.description).trim(),
            });
          }
        }
      }

      if (Array.isArray(parsed.systemDirectives)) {
        for (const dir of parsed.systemDirectives) {
          if (typeof dir === 'string' && dir.trim()) {
            result.systemDirectives.push(dir.trim());
          }
        }
      }

      if (result.skills.length > 0 || result.systemDirectives.length > 0) {
        return result;
      }
    }
  } catch (error) {
    console.warn('[teamMemory] Failed to parse JSON distillation output:', error);
  }

  // 2. Parse markdown bullet points if JSON parse failed or produced nothing
  const lines = output.split('\n');
  let currentSection: 'skills' | 'directives' | 'none' = 'none';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/skills/i.test(trimmed) && /^[#*-]/.test(trimmed)) {
      currentSection = 'skills';
      continue;
    }
    if (/(?:directives|rules|conventions)/i.test(trimmed) && /^[#*-]/.test(trimmed)) {
      currentSection = 'directives';
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^([-*]|\d+\.)\s+/, '').trim();
      if (!content) continue;

      const colonIndex = content.indexOf(':');
      if (colonIndex > 1 && colonIndex < 50) {
        const title = content.slice(0, colonIndex).replace(/\*\*/g, '').trim();
        const description = content.slice(colonIndex + 1).trim();
        result.skills.push({ title, description });
      } else if (currentSection === 'directives' || result.skills.length > 0) {
        result.systemDirectives.push(content);
      }
    }
  }

  return result;
}

/**
 * Pre-Clear Distillation Hook:
 * Reads conversations across all team agents and distills reusable skills & directives.
 */
export async function distillTeamSkills(team: TTeam): Promise<{
  skills: TeamMemorySkill[];
  systemDirectives: string[];
}> {
  const assistants = team.assistants || [];
  if (assistants.length === 0) {
    return { skills: [], systemDirectives: [] };
  }

  // 1. Gather recent messages across team assistants (bounded window for fast distillation)
  const MAX_DISTILLATION_MESSAGES_PER_ASSISTANT = 30;
  const messagesByAssistant = await Promise.all(
    assistants.map(async (assistant) => {
      if (!assistant.conversation_id) return [];
      try {
        const msgs = await loadAllConversationMessagesPaged(assistant.conversation_id, {
          limit: MAX_DISTILLATION_MESSAGES_PER_ASSISTANT,
        });
        const boundedMsgs = msgs.slice(-MAX_DISTILLATION_MESSAGES_PER_ASSISTANT);
        return boundedMsgs.map((m) =>
          Object.assign({}, m, {
            assistantName: assistant.assistant_name,
            assistantRole: assistant.role,
          })
        );
      } catch (error) {
        console.warn(`[teamMemory] Failed to load messages for assistant ${assistant.assistant_name}:`, error);
        return [];
      }
    })
  );

  const allMessages = messagesByAssistant.flat().toSorted((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

  const meaningfulMessages = allMessages.filter(
    (m): m is Extract<typeof m, IMessageText> => isTextMessage(m) && m.content.content.trim().length > 0
  );

  if (meaningfulMessages.length < 2) {
    return { skills: [], systemDirectives: [] };
  }

  // Format conversation transcript
  const MAX_TRANSCRIPT_CHARS = 10000;
  const transcript = meaningfulMessages
    .map((m) => {
      const sender =
        m.position === 'right'
          ? 'User'
          : `${(m as { assistantName?: string }).assistantName || 'Assistant'} (${(m as { assistantRole?: string }).assistantRole || 'teammate'})`;
      return `[${sender}]: ${m.content.content}`;
    })
    .join('\n\n');

  const truncatedTranscript =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? `...[Earlier conversation omitted]...\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
      : transcript;

  // 2. Trigger automated extraction call via reflection / side-question
  const leadAssistant = assistants.find((a) => a.role === 'leader') || assistants[0];
  let extractedRaw = { skills: [] as Array<{ title: string; description: string }>, systemDirectives: [] as string[] };

  if (leadAssistant?.conversation_id) {
    try {
      const prompt = `${DISTILLATION_PROMPT}\n\nConversation Transcript:\n${truncatedTranscript}`;
      const sideResult = await ipcBridge.conversation.askSideQuestion.invoke({
        conversation_id: leadAssistant.conversation_id,
        question: prompt,
      });

      if (sideResult.status === 'ok' && sideResult.answer) {
        extractedRaw = parseDistillationOutput(sideResult.answer);
      }
    } catch (error) {
      console.warn('[teamMemory] Side-question extraction failed, falling back to heuristic:', error);
    }
  }

  // Fallback to heuristic extraction if LLM call returned nothing
  if (extractedRaw.skills.length === 0 && extractedRaw.systemDirectives.length === 0) {
    extractedRaw = extractSkillsHeuristic(allMessages);
  }

  const now = Date.now();
  const distilledSkills: TeamMemorySkill[] = extractedRaw.skills.map((s) => ({
    id: uuid(),
    title: s.title,
    description: s.description,
    extractedAt: now,
  }));

  // Append distilled insights into persistent store
  appendTeamMemory(team.id, distilledSkills, extractedRaw.systemDirectives);

  // Sync to individual agent memory stores and assistant rules
  await Promise.all(
    assistants.map(async (assistant) => {
      saveAgentMemory(team.id, assistant.slot_id, getTeamMemory(team.id));

      if (assistant.assistant_id && (distilledSkills.length > 0 || extractedRaw.systemDirectives.length > 0)) {
        try {
          const existingRule = await ipcBridge.fs.readAssistantRule
            .invoke({ assistant_id: assistant.assistant_id })
            .catch(() => '');
          const skillsSection = formatMemoryForPrompt(getTeamMemory(team.id));
          const markerStart = '\n\n<!-- TEAM_LEARNED_SKILLS_START -->\n';
          const markerEnd = '\n<!-- TEAM_LEARNED_SKILLS_END -->';

          let updatedRule = '';
          if (existingRule.includes(markerStart)) {
            const baseRule = existingRule.split(markerStart)[0];
            updatedRule = `${baseRule.trim()}${markerStart}${skillsSection}${markerEnd}`;
          } else {
            updatedRule = `${existingRule.trim()}${markerStart}${skillsSection}${markerEnd}`;
          }

          await ipcBridge.fs.writeAssistantRule.invoke({
            assistant_id: assistant.assistant_id,
            content: updatedRule,
          });
        } catch (err) {
          console.warn(`[teamMemory] Failed to sync assistant rule for ${assistant.assistant_name}:`, err);
        }
      }
    })
  );

  return {
    skills: distilledSkills,
    systemDirectives: extractedRaw.systemDirectives,
  };
}

/**
 * Context Reset & Clean Slate:
 * Distills skills, cancels runs, clears all conversation histories and agent runtimes,
 * and resets the team to a pristine empty slate for the next task.
 */
export async function resetTeamForNewTask({ team, activeRunId }: { team: TTeam; activeRunId?: string }): Promise<{
  skills: TeamMemorySkill[];
  systemDirectives: string[];
}> {
  // Step 1: Pre-Clear Distillation Hook
  const extracted = await distillTeamSkills(team);

  // Step 2: Cancel active team run if running
  if (activeRunId) {
    try {
      await ipcBridge.team.cancelRun.invoke({
        team_id: team.id,
        team_run_id: activeRunId,
        reason: 'new_task',
      });
    } catch (err) {
      console.warn('[teamMemory] Failed to cancel active team run:', err);
    }
  }

  // Step 3: Purge conversation message arrays & reset agent context
  const assistants = team.assistants || [];
  await Promise.all(
    assistants.map(async (assistant) => {
      // Clear runtime context
      try {
        await ipcBridge.team.resetAgentContext.invoke({
          team_id: team.id,
          slot_id: assistant.slot_id,
        });
      } catch (err) {
        console.warn(`[teamMemory] Failed to reset runtime context for ${assistant.assistant_name}:`, err);
      }

      // Reset backend conversation
      if (assistant.conversation_id) {
        try {
          await ipcBridge.conversation.reset.invoke({ id: assistant.conversation_id });
        } catch (err) {
          console.warn(`[teamMemory] Failed to reset conversation for ${assistant.assistant_name}:`, err);
        }

        // Clear renderer in-memory message list
        emitter.emit('conversation.messages.clear', assistant.conversation_id);
      }
    })
  );

  // Step 4: Reset session injection flag & session UI state
  resetTaskMemoryInjected(team.id);
  emitter.emit('sendbox.reply.clear');
  emitter.emit('team.task.reset', team.id);
  emitter.emit('chat.history.refresh');

  return extracted;
}
