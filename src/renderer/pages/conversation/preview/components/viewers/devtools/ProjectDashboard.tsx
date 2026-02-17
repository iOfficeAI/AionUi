/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project dashboard — grid of projects and their sessions.
 * Allows navigating to individual session analyses.
 */

import { ipcBridge } from '@/common';
import type { IDevToolsProjectInfo, IDevToolsSessionListItem } from '@/common/ipcBridge';
import { Empty, Input, Spin, Tag, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatRelativeTime, shortenPath } from './helpers';

type ProjectDashboardProps = {
  onOpenSession: (sessionId: string, workspace?: string) => void;
};

/** Single session row */
const SessionRow: React.FC<{ session: IDevToolsSessionListItem; projectPath: string; onOpen: () => void }> = ({ session, projectPath, onOpen }) => {
  return (
    <div className='flex items-center gap-8px px-12px py-6px hover:bg-bg-3 cursor-pointer rd-4px transition-colors' onClick={onOpen}>
      <span className='text-12px text-t-secondary font-mono truncate flex-1' title={session.sessionId}>
        {session.sessionId}
      </span>
      <span className='text-11px text-t-quaternary flex-shrink-0'>{formatRelativeTime(session.modifiedAt)}</span>
    </div>
  );
};

/** Single project card */
const ProjectCard: React.FC<{
  project: IDevToolsProjectInfo;
  expanded: boolean;
  onToggle: () => void;
  onOpenSession: (sessionId: string, workspace: string) => void;
}> = ({ project, expanded, onToggle, onOpenSession }) => {
  const displayPath = shortenPath(project.projectPath, 4);

  return (
    <div className='border-1px border-solid border-border-2 rd-8px overflow-hidden mb-8px'>
      <div className='flex items-center gap-8px px-12px py-10px bg-bg-2 cursor-pointer hover:bg-bg-3 transition-colors' onClick={onToggle}>
        <span className='text-12px text-t-quaternary select-none'>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className='text-13px text-t-primary font-mono font-600 truncate flex-1' title={project.projectPath}>
          {displayPath}
        </span>
        <Tag size='small' color='arcoblue'>
          {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
        </Tag>
        <span className='text-11px text-t-quaternary'>{formatRelativeTime(project.latestSessionAt)}</span>
      </div>

      {expanded && (
        <div className='py-4px'>
          {project.sessions.slice(0, 50).map((session) => (
            <SessionRow key={session.sessionId} session={session} projectPath={project.projectPath} onOpen={() => onOpenSession(session.sessionId, project.projectPath)} />
          ))}
          {project.sessions.length > 50 && <div className='text-11px text-t-quaternary px-12px py-4px'>... and {project.sessions.length - 50} more sessions</div>}
        </div>
      )}
    </div>
  );
};

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ onOpenSession }) => {
  const [projects, setProjects] = useState<IDevToolsProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await ipcBridge.devtools.listProjects.invoke(undefined as any);
        if (cancelled) return;
        if (result.success && result.data) {
          setProjects(result.data);
          // Auto-expand first project
          if (result.data.length > 0) {
            setExpandedProjects(new Set([result.data[0].encodedPath]));
          }
        } else {
          setError(result.msg || 'Failed to load projects');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unexpected error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!filter.trim()) return projects;
    const lowerFilter = filter.toLowerCase();
    return projects.filter((p) => p.projectPath.toLowerCase().includes(lowerFilter) || p.sessions.some((s) => s.sessionId.toLowerCase().includes(lowerFilter)));
  }, [projects, filter]);

  const handleToggle = useCallback((encodedPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(encodedPath)) {
        next.delete(encodedPath);
      } else {
        next.add(encodedPath);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Spin size={32} tip='Loading projects...' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Empty description={error} />
      </div>
    );
  }

  const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

  return (
    <div className='h-full flex flex-col'>
      {/* Header */}
      <div className='flex items-center gap-8px px-12px py-8px border-b-1px border-b-solid border-b-border-2 flex-shrink-0'>
        <Typography.Title heading={6} style={{ margin: 0 }}>
          Projects
        </Typography.Title>
        <Tag size='small'>{projects.length} projects</Tag>
        <Tag size='small' color='arcoblue'>
          {totalSessions} sessions
        </Tag>
        <div className='ml-auto'>
          <Input.Search placeholder='Search projects...' size='small' style={{ width: 200 }} value={filter} onChange={setFilter} allowClear />
        </div>
      </div>

      {/* Project list */}
      <div className='flex-1 overflow-auto p-12px'>{filteredProjects.length === 0 ? <Empty description='No projects found' /> : filteredProjects.map((project) => <ProjectCard key={project.encodedPath} project={project} expanded={expandedProjects.has(project.encodedPath)} onToggle={() => handleToggle(project.encodedPath)} onOpenSession={(sessionId, workspace) => onOpenSession(sessionId, workspace)} />)}</div>
    </div>
  );
};

export default ProjectDashboard;
