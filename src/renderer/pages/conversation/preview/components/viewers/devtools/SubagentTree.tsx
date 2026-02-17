/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subagent tree — hierarchical visualization of Task subagent calls.
 * Shows parent → child relationships, metrics per agent, and tool usage.
 */

import type { IDevToolsSubagentInfo } from '@/common/ipcBridge';
import { Collapse, Progress, Tag, Tooltip, Typography } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { formatDuration, formatTokens, truncate } from './helpers';

type SubagentTreeProps = {
  subagents: IDevToolsSubagentInfo[];
  totalMetrics: { totalTokens: number; durationMs: number };
};

/** Tree node for the hierarchy */
type TreeNode = {
  agent: IDevToolsSubagentInfo;
  children: TreeNode[];
  depth: number;
};

/** Build a tree from flat subagent list */
function buildTree(subagents: IDevToolsSubagentInfo[]): TreeNode[] {
  // For now, all subagents are children of the main session (no nested subagents in typical usage)
  // Build a map of parentToolUseId → children for potential nesting
  const roots: TreeNode[] = [];

  for (const agent of subagents) {
    roots.push({ agent, children: [], depth: 0 });
  }

  return roots;
}

/** Single agent node in the tree */
const AgentNode: React.FC<{ node: TreeNode; totalTokens: number }> = ({ node, totalTokens }) => {
  const { agent } = node;
  const tokenPct = totalTokens > 0 ? (agent.metrics.totalTokens / totalTokens) * 100 : 0;

  return (
    <div className='mb-8px' style={{ marginLeft: node.depth * 20 }}>
      <div className='border-1px border-solid border-border-2 rd-8px overflow-hidden'>
        {/* Agent header */}
        <div className='flex items-center gap-8px px-12px py-8px bg-bg-2'>
          <Tag size='small' color='blue'>
            Agent
          </Tag>
          <span className='text-13px text-t-primary font-600 flex-1 truncate' title={agent.description}>
            {agent.description}
          </span>
          <span className='text-11px text-t-quaternary font-mono'>{agent.agentId.slice(0, 8)}</span>
        </div>

        {/* Metrics */}
        <div className='px-12px py-8px'>
          <div className='grid grid-cols-4 gap-8px mb-8px'>
            <div className='text-center'>
              <div className='text-11px text-t-quaternary mb-2px'>Messages</div>
              <div className='text-14px text-t-primary font-600'>{agent.messageCount}</div>
            </div>
            <div className='text-center'>
              <div className='text-11px text-t-quaternary mb-2px'>Tokens</div>
              <div className='text-14px text-t-primary font-600'>{formatTokens(agent.metrics.totalTokens)}</div>
            </div>
            <div className='text-center'>
              <div className='text-11px text-t-quaternary mb-2px'>Duration</div>
              <div className='text-14px text-t-primary font-600'>{formatDuration(agent.metrics.durationMs)}</div>
            </div>
            <div className='text-center'>
              <div className='text-11px text-t-quaternary mb-2px'>% of Total</div>
              <div className='text-14px text-t-primary font-600'>{tokenPct.toFixed(1)}%</div>
            </div>
          </div>

          {/* Token share bar */}
          <Progress percent={tokenPct} showText={false} size='small' color='#3491FA' />

          {/* Tools used */}
          {agent.toolNames.length > 0 && (
            <div className='mt-8px flex flex-wrap gap-4px'>
              {agent.toolNames.map((name) => (
                <Tag key={name} size='small' color='purple'>
                  {name}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {/* Children */}
        {node.children.length > 0 && (
          <div className='px-12px pb-8px'>
            {node.children.map((child) => (
              <AgentNode key={child.agent.agentId} node={child} totalTokens={totalTokens} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Summary stats for all subagents */
const SubagentSummary: React.FC<{ subagents: IDevToolsSubagentInfo[]; totalMetrics: { totalTokens: number; durationMs: number } }> = ({ subagents, totalMetrics }) => {
  const totalSubagentTokens = subagents.reduce((sum, a) => sum + a.metrics.totalTokens, 0);
  const totalSubagentMessages = subagents.reduce((sum, a) => sum + a.messageCount, 0);
  const allTools = [...new Set(subagents.flatMap((a) => a.toolNames))];
  const subagentPct = totalMetrics.totalTokens > 0 ? (totalSubagentTokens / totalMetrics.totalTokens) * 100 : 0;

  return (
    <div className='mb-16px p-12px bg-bg-2 rd-8px'>
      <div className='grid grid-cols-4 gap-12px text-center'>
        <div>
          <div className='text-11px text-t-quaternary mb-2px'>Subagents</div>
          <div className='text-18px text-t-primary font-600'>{subagents.length}</div>
        </div>
        <div>
          <div className='text-11px text-t-quaternary mb-2px'>Total Messages</div>
          <div className='text-18px text-t-primary font-600'>{totalSubagentMessages}</div>
        </div>
        <div>
          <div className='text-11px text-t-quaternary mb-2px'>Total Tokens</div>
          <div className='text-18px text-t-primary font-600'>{formatTokens(totalSubagentTokens)}</div>
        </div>
        <div>
          <div className='text-11px text-t-quaternary mb-2px'>% of Session</div>
          <div className='text-18px text-t-primary font-600'>{subagentPct.toFixed(1)}%</div>
        </div>
      </div>
      {allTools.length > 0 && (
        <div className='mt-8px flex flex-wrap gap-4px justify-center'>
          <span className='text-11px text-t-quaternary mr-4px'>Tools:</span>
          {allTools.map((name) => (
            <Tag key={name} size='small'>
              {name}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
};

const SubagentTree: React.FC<SubagentTreeProps> = ({ subagents, totalMetrics }) => {
  const tree = useMemo(() => buildTree(subagents), [subagents]);

  if (subagents.length === 0) {
    return (
      <div className='h-full flex items-center justify-center'>
        <div className='text-13px text-t-tertiary'>No subagents used in this session</div>
      </div>
    );
  }

  return (
    <div className='h-full overflow-auto p-12px'>
      <Typography.Title heading={6} className='mb-12px'>
        Subagent Hierarchy
      </Typography.Title>

      <SubagentSummary subagents={subagents} totalMetrics={totalMetrics} />

      {/* Timeline-ordered agents */}
      <div>
        {tree.map((node) => (
          <AgentNode key={node.agent.agentId} node={node} totalTokens={totalMetrics.totalTokens} />
        ))}
      </div>
    </div>
  );
};

export default SubagentTree;
