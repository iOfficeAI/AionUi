/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, PartUnion } from '@google/genai';
import type { AnyToolInvocation, Config } from '@office-ai/aioncli-core';
import { getErrorMessage, isNodeError, unescapePath } from '@office-ai/aioncli-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { HistoryItem, IndividualToolCallDisplay } from './types';
import { ToolCallStatus } from './types';

// Truncation constants synced from aioncli-core/src/utils/fileUtils.ts
const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

/**
 * Truncates file content to prevent token overflow.
 * Synced from aioncli-core/src/utils/fileUtils.ts
 */
function truncateFileContent(content: string): { content: string; truncated: boolean } {
  const lines = content.split('\n');
  let truncated = false;

  const truncatedLines = lines.map((line) => {
    if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
      truncated = true;
      return line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + '... [truncated]';
    }
    return line;
  });

  if (truncatedLines.length > DEFAULT_MAX_LINES_TEXT_FILE) {
    truncated = true;
    const result = truncatedLines.slice(0, DEFAULT_MAX_LINES_TEXT_FILE);
    result.push(`\n... [${truncatedLines.length - DEFAULT_MAX_LINES_TEXT_FILE} more lines truncated]`);
    return { content: result.join('\n'), truncated };
  }

  return { content: truncatedLines.join('\n'), truncated };
}

interface HandleAtCommandParams {
  query: string;
  config: Config;
  addItem: (...args: unknown[]) => void; //@mark mock addItem it not use
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
  /**
   * 懒加载模式：不立即读取文件内容，只传递文件路径提示给 agent
   * 让 agent 自主决定何时使用 read_file 工具读取文件
   * Lazy loading mode: don't read file content immediately, only pass file path hints to agent
   * Let agent decide when to use read_file tool to read files
   */
  lazyFileLoading?: boolean;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
}

interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles \ escaped spaces within paths.
 */
function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // Find next unescaped '@'
    while (nextSearchIndex < query.length) {
      if (query[nextSearchIndex] === '@' && (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // No more @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // Add text before @
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // Parse @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        // Path ends at first whitespace or punctuation not escaped
        break;
      } else if (char === '.') {
        // For . we need to be more careful - only terminate if followed by whitespace or end of string
        // This allows file extensions like .txt, .js but terminates at sentence endings like "file.txt. Next sentence"
        const nextChar = pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : '';
        if (nextChar === '' || /\s/.test(nextChar)) {
          break;
        }
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    // unescapePath expects the @ symbol to be present, and will handle it.
    const atPath = unescapePath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter((part) => !(part.type === 'text' && part.content.trim() === ''));
}

/**
 * Processes user input potentially containing one or more '@<path>' commands.
 * If found, it attempts to read the specified files/directories using the
 * 'read_many_files' tool. The user query is modified to include resolved paths,
 * and the content of the files is appended in a structured block.
 *
 * @returns An object indicating whether the main hook should proceed with an
 *          LLM call and the processed query parts (including file content).
 */
export async function handleAtCommand({ query, config, addItem, onDebugMessage, messageId: userMessageTimestamp, signal, lazyFileLoading = false }: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  const commandParts = parseAllAtCommands(query);
  const atPathCommandParts = commandParts.filter((part) => part.type === 'atPath');

  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  addItem({ type: 'user', text: query }, userMessageTimestamp);

  // Get centralized file discovery service
  const fileDiscovery = config.getFileService();

  const respectFileIgnore = config.getFileFilteringOptions();

  const pathSpecsToRead: string[] = [];
  const atPathToResolvedSpecMap = new Map<string, string>();
  const contentLabelsForDisplay: string[] = [];
  const ignoredByReason: Record<string, string[]> = {
    git: [],
    gemini: [],
    both: [],
  };

  const toolRegistry = await config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');
  const globTool = toolRegistry.getTool('glob');

  // Flag to use fallback direct file reading when read_many_files tool is not available
  const useFallbackFileReading = !readManyFilesTool;
  if (useFallbackFileReading) {
    onDebugMessage('read_many_files tool not found, using fallback direct file reading');
  }

  for (const atPathPart of atPathCommandParts) {
    const originalAtPath = atPathPart.content; // e.g., "@file.txt" or "@"

    if (originalAtPath === '@') {
      onDebugMessage('Lone @ detected, will be treated as text in the modified query.');
      continue;
    }

    const pathName = originalAtPath.substring(1);
    if (!pathName) {
      // This case should ideally not be hit if parseAllAtCommands ensures content after @
      // but as a safeguard:
      addItem(
        {
          type: 'error',
          text: `Error: Invalid @ command '${originalAtPath}'. No path specified.`,
        },
        userMessageTimestamp
      );
      // Decide if this is a fatal error for the whole command or just skip this @ part
      // For now, let's be strict and fail the command if one @path is malformed.
      return { processedQuery: null, shouldProceed: false };
    }

    // Check if path should be ignored based on filtering options

    const workspaceContext = config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(pathName)) {
      onDebugMessage(`Path ${pathName} is not in the workspace and will be skipped.`);
      continue;
    }

    const gitIgnored =
      respectFileIgnore.respectGitIgnore &&
      fileDiscovery.shouldIgnoreFile(pathName, {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      });
    const geminiIgnored =
      respectFileIgnore.respectGeminiIgnore &&
      fileDiscovery.shouldIgnoreFile(pathName, {
        respectGitIgnore: false,
        respectGeminiIgnore: true,
      });

    if (gitIgnored || geminiIgnored) {
      const reason = gitIgnored && geminiIgnored ? 'both' : gitIgnored ? 'git' : 'gemini';
      ignoredByReason[reason].push(pathName);
      const reasonText = reason === 'both' ? 'ignored by both git and gemini' : reason === 'git' ? 'git-ignored' : 'gemini-ignored';
      onDebugMessage(`Path ${pathName} is ${reasonText} and will be skipped.`);
      continue;
    }

    for (const dir of config.getWorkspaceContext().getDirectories()) {
      let currentPathSpec = pathName;
      let resolvedSuccessfully = false;
      try {
        const absolutePath = path.resolve(dir, pathName);
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
          currentPathSpec = pathName + (pathName.endsWith(path.sep) ? `**` : `/**`);
          onDebugMessage(`Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`);
        } else {
          onDebugMessage(`Path ${pathName} resolved to file: ${absolutePath}`);
        }
        resolvedSuccessfully = true;
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (config.getEnableRecursiveFileSearch() && globTool) {
            onDebugMessage(`Path ${pathName} not found directly, attempting glob search.`);
            try {
              const globResult = await globTool.buildAndExecute(
                {
                  pattern: `**/*${pathName}*`,
                  path: dir,
                },
                signal
              );
              if (globResult.llmContent && typeof globResult.llmContent === 'string' && !globResult.llmContent.startsWith('No files found') && !globResult.llmContent.startsWith('Error:')) {
                const lines = globResult.llmContent.split('\n');
                if (lines.length > 1 && lines[1]) {
                  const firstMatchAbsolute = lines[1].trim();
                  currentPathSpec = path.relative(dir, firstMatchAbsolute);
                  onDebugMessage(`Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${currentPathSpec}`);
                  resolvedSuccessfully = true;
                } else {
                  onDebugMessage(`Glob search for '**/*${pathName}*' did not return a usable path. Path ${pathName} will be skipped.`);
                }
              } else {
                onDebugMessage(`Glob search for '**/*${pathName}*' found no files or an error. Path ${pathName} will be skipped.`);
              }
            } catch (globError) {
              console.error(`Error during glob search for ${pathName}: ${getErrorMessage(globError)}`);
              onDebugMessage(`Error during glob search for ${pathName}. Path ${pathName} will be skipped.`);
            }
          } else {
            onDebugMessage(`Glob tool not found. Path ${pathName} will be skipped.`);
          }
        } else {
          console.error(`Error stating path ${pathName}: ${getErrorMessage(error)}`);
          onDebugMessage(`Error stating path ${pathName}. Path ${pathName} will be skipped.`);
        }
      }
      if (resolvedSuccessfully) {
        pathSpecsToRead.push(currentPathSpec);
        atPathToResolvedSpecMap.set(originalAtPath, currentPathSpec);
        contentLabelsForDisplay.push(pathName);
        break;
      }
    }
  }

  // Construct the initial part of the query for the LLM
  let initialQueryText = '';
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    if (part.type === 'text') {
      initialQueryText += part.content;
    } else {
      // type === 'atPath'
      const resolvedSpec = atPathToResolvedSpecMap.get(part.content);
      if (i > 0 && initialQueryText.length > 0 && !initialQueryText.endsWith(' ')) {
        // Add space if previous part was text and didn't end with space, or if previous was @path
        const prevPart = commandParts[i - 1];
        if (prevPart.type === 'text' || (prevPart.type === 'atPath' && atPathToResolvedSpecMap.has(prevPart.content))) {
          initialQueryText += ' ';
        }
      }
      if (resolvedSpec) {
        initialQueryText += `@${resolvedSpec}`;
      } else {
        // If not resolved for reading (e.g. lone @ or invalid path that was skipped),
        // add the original @-string back, ensuring spacing if it's not the first element.
        if (i > 0 && initialQueryText.length > 0 && !initialQueryText.endsWith(' ') && !part.content.startsWith(' ')) {
          initialQueryText += ' ';
        }
        initialQueryText += part.content;
      }
    }
  }
  initialQueryText = initialQueryText.trim();

  // Inform user about ignored paths
  const totalIgnored = ignoredByReason.git.length + ignoredByReason.gemini.length + ignoredByReason.both.length;

  if (totalIgnored > 0) {
    const messages = [];
    if (ignoredByReason.git.length) {
      messages.push(`Git-ignored: ${ignoredByReason.git.join(', ')}`);
    }
    if (ignoredByReason.gemini.length) {
      messages.push(`Gemini-ignored: ${ignoredByReason.gemini.join(', ')}`);
    }
    if (ignoredByReason.both.length) {
      messages.push(`Ignored by both: ${ignoredByReason.both.join(', ')}`);
    }

    const message = `Ignored ${totalIgnored} files:\n${messages.join('\n')}`;
    onDebugMessage(message);
  }

  // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
  if (pathSpecsToRead.length === 0) {
    onDebugMessage('No valid file paths found in @ commands to read.');
    if (initialQueryText === '@' && query.trim() === '@') {
      // If the only thing was a lone @, pass original query (which might have spaces)
      return { processedQuery: [{ text: query }], shouldProceed: true };
    } else if (!initialQueryText && query) {
      // If all @-commands were invalid and no surrounding text, pass original query
      return { processedQuery: [{ text: query }], shouldProceed: true };
    }
    // Otherwise, proceed with the (potentially modified) query text that doesn't involve file reading
    return {
      processedQuery: [{ text: initialQueryText || query }],
      shouldProceed: true,
    };
  }

  const processedQueryParts: PartUnion[] = [{ text: initialQueryText }];

  // 懒加载模式：不读取文件内容，只传递文件路径提示给 agent
  // Lazy loading mode: don't read file content, only pass file path hints to agent
  if (lazyFileLoading) {
    const workspaceDirs = config.getWorkspaceContext().getDirectories();
    const workspaceDir = workspaceDirs[0] || process.cwd();

    processedQueryParts.push({
      text: '\n\n[Files referenced in workspace - use read_file tool to access when needed]:',
    });

    for (const pathSpec of pathSpecsToRead) {
      const absolutePath = path.resolve(workspaceDir, pathSpec);
      processedQueryParts.push({
        text: `\n- ${pathSpec} (path: ${absolutePath})`,
      });
      onDebugMessage(`File reference added (lazy mode): ${pathSpec}`);
    }

    processedQueryParts.push({
      text: '\n\nNote: File contents are not loaded. Use read_file or read_many_files tool to read file content when you need it.',
    });

    return { processedQuery: processedQueryParts, shouldProceed: true };
  }

  // Use fallback direct file reading if read_many_files tool is not available
  if (useFallbackFileReading) {
    try {
      const workspaceDirs = config.getWorkspaceContext().getDirectories();
      const workspaceDir = workspaceDirs[0] || process.cwd();

      processedQueryParts.push({
        text: '\n--- Content from referenced files ---',
      });

      for (const pathSpec of pathSpecsToRead) {
        try {
          const absolutePath = path.resolve(workspaceDir, pathSpec);
          const rawContent = await fs.readFile(absolutePath, 'utf-8');
          // Apply truncation to prevent token overflow
          const { content: fileContent, truncated } = truncateFileContent(rawContent);
          processedQueryParts.push({
            text: `\nContent from @${pathSpec}${truncated ? ' (truncated)' : ''}:\n`,
          });
          processedQueryParts.push({ text: fileContent });
          onDebugMessage(`Successfully read file: ${pathSpec}${truncated ? ' (content truncated to prevent token overflow)' : ''}`);
        } catch (readError) {
          onDebugMessage(`Failed to read file ${pathSpec}: ${getErrorMessage(readError)}`);
          // Continue with other files even if one fails
        }
      }

      processedQueryParts.push({ text: '\n--- End of content ---' });
      return { processedQuery: processedQueryParts, shouldProceed: true };
    } catch (error) {
      addItem({ type: 'error', text: `Error reading files: ${getErrorMessage(error)}` }, userMessageTimestamp);
      return { processedQuery: null, shouldProceed: false };
    }
  }

  // Use read_many_files tool when available
  const toolArgs = {
    paths: pathSpecsToRead,
    file_filtering_options: {
      respect_git_ignore: respectFileIgnore.respectGitIgnore,
      respect_gemini_ignore: respectFileIgnore.respectGeminiIgnore,
    },
    // Use configuration setting
  };
  let toolCallDisplay: IndividualToolCallDisplay;

  let invocation: AnyToolInvocation | undefined = undefined;
  try {
    invocation = readManyFilesTool!.build(toolArgs);
    const result = await invocation.execute(signal);
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool!.displayName,
      description: invocation.getDescription(),
      status: ToolCallStatus.Success,
      resultDisplay: result.returnDisplay || `Successfully read: ${contentLabelsForDisplay.join(', ')}`,
      confirmationDetails: undefined,
    };

    if (Array.isArray(result.llmContent)) {
      const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
      processedQueryParts.push({
        text: '\n--- Content from referenced files ---',
      });
      for (const part of result.llmContent) {
        if (typeof part === 'string') {
          const match = fileContentRegex.exec(part);
          if (match) {
            const filePathSpecInContent = match[1]; // This is a resolved pathSpec
            const fileActualContent = match[2].trim();
            processedQueryParts.push({
              text: `\nContent from @${filePathSpecInContent}:\n`,
            });
            processedQueryParts.push({ text: fileActualContent });
          } else {
            processedQueryParts.push({ text: part });
          }
        } else {
          // part is a Part object.
          processedQueryParts.push(part);
        }
      }
      processedQueryParts.push({ text: '\n--- End of content ---' });
    } else {
      onDebugMessage('read_many_files tool returned no content or empty content.');
    }

    addItem({ type: 'tool_group', tools: [toolCallDisplay] } as Omit<HistoryItem, 'id'>, userMessageTimestamp);
    return { processedQuery: processedQueryParts, shouldProceed: true };
  } catch (error: unknown) {
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool!.displayName,
      description: invocation?.getDescription() ?? 'Error attempting to execute tool to read files',
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading files (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    addItem({ type: 'tool_group', tools: [toolCallDisplay] } as Omit<HistoryItem, 'id'>, userMessageTimestamp);
    return { processedQuery: null, shouldProceed: false };
  }
}
