/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Message, Tag } from '@arco-design/web-react';
import { AlarmClock, Brain, CheckOne, Copy, LinkCloud, MessageOne, Peoples, Shield, Terminal } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './BoardroomPage.module.css';

type BoardroomView = 'meetings' | 'war-room' | 'blackboard';

type AgentLane = {
  id: string;
  name: string;
  role: string;
  home: string;
  status: 'ready' | 'watch' | 'standby';
  accent: 'gold' | 'green' | 'blue' | 'rose';
};

type MeetingPreset = {
  id: string;
  name: string;
  cadence: string;
  owner: string;
  prompt: string;
};

type WarRoomItem = {
  id: string;
  severity: 'P0' | 'P1' | 'P2';
  title: string;
  owner: string;
  route: string;
};

const views: Array<{ id: BoardroomView; label: string }> = [
  { id: 'meetings', label: 'Meetings' },
  { id: 'war-room', label: 'War Room' },
  { id: 'blackboard', label: 'Blackboard' },
];

const agentLanes: AgentLane[] = [
  {
    id: 'orchestrator',
    name: 'Hermes',
    role: 'Gateway, Kanban, dispatcher, meetings',
    home: 'Local control bus',
    status: 'ready',
    accent: 'gold',
  },
  {
    id: 'operator',
    name: 'OpenClaw',
    role: 'Actions, tools, connector checks',
    home: 'Operator runtime',
    status: 'ready',
    accent: 'green',
  },
  {
    id: 'jarvis',
    name: 'Mark-XXX',
    role: 'Jarvis Native, screen, launchers',
    home: 'Desktop runtime',
    status: 'watch',
    accent: 'blue',
  },
  {
    id: 'memory',
    name: 'ClawMem',
    role: 'Shared memory, receipts, Obsidian',
    home: 'Knowledge layer',
    status: 'ready',
    accent: 'rose',
  },
];

const meetingPresets: MeetingPreset[] = [
  {
    id: 'daily-sync',
    name: 'Daily Agent Sync',
    cadence: 'Daily',
    owner: 'Hermes',
    prompt:
      'Nova Boardroom daily sync: gather Hermes, OpenClaw, Mark-XXX, ClawMem, AionUi and Radar status. Return blockers, owners, next actions and receipts.',
  },
  {
    id: 'research-review',
    name: 'Research Review',
    cadence: 'On demand',
    owner: 'Radar',
    prompt:
      'Nova Boardroom research review: inspect Nova AI Radar, YouTube trends, Jina Reader, Scrapling, browser-harness and Obsidian notes. Decide what to integrate now.',
  },
  {
    id: 'release-check',
    name: 'Release Check',
    cadence: 'Before push',
    owner: 'Codex',
    prompt:
      'Nova Boardroom release check: verify changed files, tests, receipts, git status, commit scope and remaining risk before push.',
  },
];

const warRoomItems: WarRoomItem[] = [
  {
    id: 'runtime-health',
    severity: 'P1',
    title: 'Runtime health drift',
    owner: 'Hermes',
    route: '/settings/system',
  },
  {
    id: 'connector-auth',
    severity: 'P1',
    title: 'Connector/auth checks',
    owner: 'OpenClaw',
    route: '/settings/providers',
  },
  {
    id: 'job-backlog',
    severity: 'P2',
    title: 'Kanban and scheduled backlog',
    owner: 'AionUi',
    route: '/scheduled',
  },
];

const blackboardItems = [
  { label: 'Agent Bus', value: 'Hermes/OpenClaw events' },
  { label: 'Shared Context', value: 'ClawMem plus Obsidian' },
  { label: 'Receipts', value: 'Command proof and run logs' },
  { label: 'Meetings', value: 'Goals, decisions, owners' },
];

const statusLabel: Record<AgentLane['status'], string> = {
  ready: 'Ready',
  watch: 'Watch',
  standby: 'Standby',
};

const BoardroomPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<BoardroomView>('meetings');

  const activeMeeting = useMemo(() => meetingPresets[0], []);

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      Message.success('Meeting prompt copied');
    } catch {
      Message.error('Clipboard unavailable');
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>
            <Peoples theme='outline' size='18' />
            <span>Nova Agent OS</span>
          </div>
          <h1>Boardroom</h1>
          <p>Agents, meetings, war-room state, shared context and proof in one operational surface.</p>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<MessageOne theme='outline' />} onClick={() => navigate('/guid')}>
            New Brief
          </Button>
          <Button type='primary' icon={<Copy theme='outline' />} onClick={() => copyPrompt(activeMeeting.prompt)}>
            Copy Sync
          </Button>
        </div>
      </header>

      <section className={styles.topGrid}>
        {agentLanes.map((lane) => (
          <article key={lane.id} className={classNames(styles.agentTile, styles[lane.accent])}>
            <div className={styles.agentTop}>
              <span className={styles.agentMark}>{lane.name.slice(0, 2).toUpperCase()}</span>
              <Tag color={lane.status === 'ready' ? 'green' : lane.status === 'watch' ? 'orange' : 'gray'}>
                {statusLabel[lane.status]}
              </Tag>
            </div>
            <h2>{lane.name}</h2>
            <p>{lane.role}</p>
            <span className={styles.agentHome}>{lane.home}</span>
          </article>
        ))}
      </section>

      <nav className={styles.segmented} aria-label='Boardroom views'>
        {views.map((view) => (
          <button
            key={view.id}
            type='button'
            className={classNames(styles.segmentButton, activeView === view.id && styles.segmentButtonActive)}
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {activeView === 'meetings' && (
        <section className={styles.contentGrid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Cadence</span>
                <h2>Meetings</h2>
              </div>
              <AlarmClock theme='outline' size='22' />
            </div>
            <div className={styles.meetingList}>
              {meetingPresets.map((meeting) => (
                <article key={meeting.id} className={styles.meetingRow}>
                  <div>
                    <h3>{meeting.name}</h3>
                    <p>
                      {meeting.cadence} / {meeting.owner}
                    </p>
                  </div>
                  <Button size='small' icon={<Copy theme='outline' />} onClick={() => copyPrompt(meeting.prompt)}>
                    Prompt
                  </Button>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Routing</span>
                <h2>Agent Rooms</h2>
              </div>
              <LinkCloud theme='outline' size='22' />
            </div>
            <div className={styles.actionStack}>
              <Button icon={<Peoples theme='outline' />} onClick={() => navigate('/team')}>
                Teams
              </Button>
              <Button icon={<AlarmClock theme='outline' />} onClick={() => navigate('/scheduled')}>
                Scheduled
              </Button>
              <Button icon={<Terminal theme='outline' />} onClick={() => navigate('/settings/capabilities')}>
                Capabilities
              </Button>
            </div>
          </div>
        </section>
      )}

      {activeView === 'war-room' && (
        <section className={styles.contentGrid}>
          <div className={styles.panelWide}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Live Ops</span>
                <h2>War Room</h2>
              </div>
              <Shield theme='outline' size='22' />
            </div>
            <div className={styles.incidentList}>
              {warRoomItems.map((item) => (
                <article key={item.id} className={styles.incidentRow}>
                  <Tag color={item.severity === 'P1' ? 'red' : 'orange'}>{item.severity}</Tag>
                  <div>
                    <h3>{item.title}</h3>
                    <p>Owner: {item.owner}</p>
                  </div>
                  <Button size='small' onClick={() => navigate(item.route)}>
                    Open
                  </Button>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Escalation</span>
                <h2>Rules</h2>
              </div>
              <CheckOne theme='outline' size='22' />
            </div>
            <ul className={styles.ruleList}>
              <li>P0 blocks ship or exposes secrets.</li>
              <li>P1 blocks agent control or runtime health.</li>
              <li>P2 needs owner, receipt and next review.</li>
            </ul>
          </div>
        </section>
      )}

      {activeView === 'blackboard' && (
        <section className={styles.contentGrid}>
          <div className={styles.panelWide}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Shared Truth</span>
                <h2>Blackboard</h2>
              </div>
              <Brain theme='outline' size='22' />
            </div>
            <div className={styles.blackboardGrid}>
              {blackboardItems.map((item) => (
                <article key={item.label} className={styles.blackboardItem}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>Proof</span>
                <h2>Receipts</h2>
              </div>
              <Terminal theme='outline' size='22' />
            </div>
            <div className={styles.actionStack}>
              <Button onClick={() => navigate('/settings/system')}>System</Button>
              <Button onClick={() => navigate('/settings/providers')}>Providers</Button>
              <Button onClick={() => navigate('/settings/capabilities')}>Tools</Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
};

export default BoardroomPage;
