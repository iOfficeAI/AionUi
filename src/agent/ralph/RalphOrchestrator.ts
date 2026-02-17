/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RalphConfig, RalphIterationResult, RalphPrd, RalphProgressEntry, RalphRunStatus } from './types';
import { RALPH_COMPLETION_SIGNAL, RALPH_DEFAULTS } from './types';
import { getNextStory, isAllComplete, markStoryComplete, getCompletionStats, parsePrd } from './PrdParser';
import { appendProgress, formatProgressEntry, parseProgress } from './ProgressTracker';
import { buildIterationPrompt } from './RalphPromptBuilder';

/**
 * Callback for sending a message to the AI agent and receiving its response.
 */
export type SendMessageFn = (prompt: string) => Promise<string>;

/**
 * Callback for reading/writing files in the workspace.
 */
export type FileSystemFn = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
};

/**
 * Callback for status updates during the run.
 */
export type StatusCallback = (status: { iteration: number; maxIterations: number; storyId: string; storyTitle: string; runStatus: RalphRunStatus; stats: { total: number; completed: number; remaining: number; percentage: number } }) => void;

/**
 * RalphOrchestrator manages the autonomous iteration loop.
 *
 * It reads the PRD and progress from the workspace, builds prompts for each
 * iteration, sends them to the AI agent, and tracks progress until all stories
 * are complete or the max iteration count is reached.
 */
export class RalphOrchestrator {
  private config: RalphConfig;
  private sendMessage: SendMessageFn;
  private fs: FileSystemFn;
  private onStatus: StatusCallback | undefined;
  private _status: RalphRunStatus = 'idle';
  private _currentIteration = 0;

  constructor(sendMessage: SendMessageFn, fs: FileSystemFn, config: Partial<RalphConfig> = {}, onStatus?: StatusCallback) {
    this.config = { ...RALPH_DEFAULTS, ...config };
    this.sendMessage = sendMessage;
    this.fs = fs;
    this.onStatus = onStatus;
  }

  get status(): RalphRunStatus {
    return this._status;
  }

  get currentIteration(): number {
    return this._currentIteration;
  }

  /**
   * Run the autonomous loop until all stories are complete or max iterations reached.
   * Returns the list of iteration results.
   */
  async run(): Promise<RalphIterationResult[]> {
    this._status = 'running';
    const results: RalphIterationResult[] = [];

    try {
      // Read PRD
      let prd = await this.loadPrd();
      let progressContent = await this.loadProgress();
      const agentsContent = await this.loadAgents();

      for (let i = 1; i <= this.config.maxIterations; i++) {
        this._currentIteration = i;

        // Check if all complete before starting iteration
        if (isAllComplete(prd)) {
          this._status = 'completed';
          break;
        }

        const nextStory = getNextStory(prd);
        if (!nextStory) {
          this._status = 'completed';
          break;
        }

        // Emit status
        const stats = getCompletionStats(prd);
        this.onStatus?.({
          iteration: i,
          maxIterations: this.config.maxIterations,
          storyId: nextStory.id,
          storyTitle: nextStory.title,
          runStatus: 'running',
          stats,
        });

        // Build prompt for this iteration
        const prompt = buildIterationPrompt(prd, progressContent, agentsContent, i, this.config.maxIterations);

        // Send to AI agent
        const output = await this.sendMessage(prompt);

        // Check for completion signal
        const hasCompletionSignal = output.includes(RALPH_COMPLETION_SIGNAL);

        // Create progress entry
        const progressEntry: RalphProgressEntry = {
          iteration: i,
          storyId: nextStory.id,
          storyTitle: nextStory.title,
          summary: extractSummary(output),
          filesChanged: extractFilesChanged(output),
          learnings: extractLearnings(output),
          timestamp: Date.now(),
        };

        // Update progress
        progressContent = appendProgress(progressContent, progressEntry);
        await this.fs.writeFile('progress.txt', progressContent);

        // Mark story as complete (trust the AI's work within the iteration)
        prd = markStoryComplete(prd, nextStory.id);
        await this.fs.writeFile('prd.json', JSON.stringify(prd, null, 2));

        const allComplete = isAllComplete(prd);
        results.push({
          iteration: i,
          storyId: nextStory.id,
          success: true,
          allComplete: allComplete || hasCompletionSignal,
          output,
        });

        if (allComplete || hasCompletionSignal) {
          this._status = 'completed';
          break;
        }
      }

      // If we exhausted iterations without completing
      if (this._status === 'running') {
        this._status = 'max_iterations_reached';
      }
    } catch (error) {
      this._status = 'failed';
      throw error;
    }

    // Final status callback
    try {
      const prd = await this.loadPrd();
      const stats = getCompletionStats(prd);
      this.onStatus?.({
        iteration: this._currentIteration,
        maxIterations: this.config.maxIterations,
        storyId: '',
        storyTitle: '',
        runStatus: this._status,
        stats,
      });
    } catch {
      // Ignore errors in final status callback
    }

    return results;
  }

  /**
   * Run a single iteration and return the result.
   */
  async runSingleIteration(iteration: number): Promise<RalphIterationResult> {
    const prd = await this.loadPrd();
    const progressContent = await this.loadProgress();
    const agentsContent = await this.loadAgents();

    const nextStory = getNextStory(prd);
    if (!nextStory) {
      return {
        iteration,
        storyId: '',
        success: true,
        allComplete: true,
        output: 'All stories are already complete.',
      };
    }

    const prompt = buildIterationPrompt(prd, progressContent, agentsContent, iteration, this.config.maxIterations);
    const output = await this.sendMessage(prompt);
    const hasCompletionSignal = output.includes(RALPH_COMPLETION_SIGNAL);

    // Update PRD
    const updatedPrd = markStoryComplete(prd, nextStory.id);
    await this.fs.writeFile('prd.json', JSON.stringify(updatedPrd, null, 2));

    // Update progress
    const progressEntry: RalphProgressEntry = {
      iteration,
      storyId: nextStory.id,
      storyTitle: nextStory.title,
      summary: extractSummary(output),
      filesChanged: extractFilesChanged(output),
      learnings: extractLearnings(output),
      timestamp: Date.now(),
    };
    const updatedProgress = appendProgress(progressContent, progressEntry);
    await this.fs.writeFile('progress.txt', updatedProgress);

    return {
      iteration,
      storyId: nextStory.id,
      success: true,
      allComplete: isAllComplete(updatedPrd) || hasCompletionSignal,
      output,
    };
  }

  private async loadPrd(): Promise<RalphPrd> {
    const content = await this.fs.readFile('prd.json');
    return parsePrd(content);
  }

  private async loadProgress(): Promise<string> {
    const exists = await this.fs.exists('progress.txt');
    if (!exists) return '';
    return this.fs.readFile('progress.txt');
  }

  private async loadAgents(): Promise<string> {
    const exists = await this.fs.exists('AGENTS.md');
    if (!exists) return '';
    return this.fs.readFile('AGENTS.md');
  }
}

/**
 * Extract a summary from the AI output.
 * Looks for common patterns in the output to find the summary section.
 */
export function extractSummary(output: string): string {
  // Try to find explicit summary sections
  const summaryPatterns = [/##?\s*Summary\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i, /##?\s*What I (?:did|implemented)\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i, /##?\s*Changes?\s*(?:Made|Summary)\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i];

  for (const pattern of summaryPatterns) {
    const match = output.match(pattern);
    if (match && match[1].trim()) {
      return match[1].trim().slice(0, 500);
    }
  }

  // Fallback: take the first substantive paragraph
  const paragraphs = output
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 20 && !p.startsWith('#') && !p.startsWith('```'));

  return paragraphs[0]?.slice(0, 500) || 'Iteration completed.';
}

/**
 * Extract files changed from the AI output.
 */
export function extractFilesChanged(output: string): string[] {
  const files: string[] = [];

  // Look for file list sections
  const filePatterns = [/##?\s*Files?\s*Changed\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i, /\*\*Files?\s*(?:Changed|Modified)\*\*:?\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i];

  for (const pattern of filePatterns) {
    const match = output.match(pattern);
    if (match) {
      const listItems = match[1].match(/[-*]\s+`?([^\n`]+)`?/g);
      if (listItems) {
        for (const item of listItems) {
          const cleaned = item
            .replace(/^[-*]\s+`?/, '')
            .replace(/`?\s*$/, '')
            .trim();
          if (cleaned && !files.includes(cleaned)) {
            files.push(cleaned);
          }
        }
      }
    }
  }

  // Also look for file paths mentioned in git commit contexts
  const gitFilePattern = /(?:modified|created|added|deleted|renamed):\s+(\S+)/gi;
  let gitMatch: RegExpExecArray | null;
  while ((gitMatch = gitFilePattern.exec(output)) !== null) {
    const file = gitMatch[1].trim();
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }

  return files;
}

/**
 * Extract learnings from the AI output.
 */
export function extractLearnings(output: string): string[] {
  const learnings: string[] = [];

  const learningPatterns = [/##?\s*Learnings?\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i, /##?\s*(?:Notes?|Observations?)\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i];

  for (const pattern of learningPatterns) {
    const match = output.match(pattern);
    if (match) {
      const listItems = match[1].match(/[-*]\s+(.+)/g);
      if (listItems) {
        for (const item of listItems) {
          const cleaned = item.replace(/^[-*]\s+/, '').trim();
          if (cleaned) {
            learnings.push(cleaned);
          }
        }
      }
    }
  }

  return learnings;
}
