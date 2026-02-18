/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A single user story in the PRD.
 */
export type RalphUserStory = {
  /** Story identifier, e.g. "US-001" */
  id: string;
  /** Brief story title */
  title: string;
  /** User story in "As a... I want... so that..." format */
  description: string;
  /** Concrete, testable acceptance criteria */
  acceptanceCriteria: string[];
  /** Execution priority (1 = first) */
  priority: number;
  /** Whether the story has been completed */
  passes: boolean;
  /** Optional notes populated during execution */
  notes?: string;
};

/**
 * Product Requirements Document consumed by the autonomous loop.
 */
export type RalphPrd = {
  /** Project name */
  project: string;
  /** Git branch for this feature */
  branchName: string;
  /** High-level description of the feature */
  description: string;
  /** Ordered list of user stories */
  userStories: RalphUserStory[];
};

/**
 * A single progress entry appended after each iteration.
 */
export type RalphProgressEntry = {
  /** Iteration number (1-based) */
  iteration: number;
  /** Story ID worked on */
  storyId: string;
  /** Story title */
  storyTitle: string;
  /** Summary of changes made */
  summary: string;
  /** Files changed in this iteration */
  filesChanged: string[];
  /** Learnings discovered */
  learnings: string[];
  /** Timestamp of the entry */
  timestamp: number;
};

/**
 * Configuration for a Ralph autonomous run.
 */
export type RalphConfig = {
  /** Maximum number of iterations before forced stop */
  maxIterations: number;
  /** Whether to auto-approve all tool calls (YOLO mode) */
  yoloMode: boolean;
};

/**
 * Result of a single Ralph iteration.
 */
export type RalphIterationResult = {
  /** Iteration number */
  iteration: number;
  /** Story that was worked on */
  storyId: string;
  /** Whether the story was completed successfully */
  success: boolean;
  /** Whether all stories are now complete */
  allComplete: boolean;
  /** Output from the AI agent */
  output: string;
};

/**
 * Overall status of a Ralph run.
 */
export type RalphRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'max_iterations_reached';

/** Default configuration values */
export const RALPH_DEFAULTS: RalphConfig = {
  maxIterations: 10,
  yoloMode: true,
};

/** Completion signal that the AI agent outputs when all stories pass */
export const RALPH_COMPLETION_SIGNAL = '<promise>COMPLETE</promise>';
