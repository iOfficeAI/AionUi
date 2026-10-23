/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message, Modal } from '@arco-design/web-react';
import type { TTeam } from '@/common/types/team/teamTypes';
import TeamNewTaskButton from '@/renderer/pages/team/components/TeamNewTaskButton';
import * as teamMemoryManager from '@/renderer/pages/team/utils/teamMemoryManager';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let str = (options?.defaultValue as string) ?? key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return str;
    },
  }),
}));

describe('TeamNewTaskButton', () => {
  const mockTeam: TTeam = {
    id: 'team-task-btn-test',
    name: 'Frontend Team',
    assistants: [
      {
        slot_id: 'slot-1',
        role: 'leader',
        assistant_name: 'Lead',
        conversation_id: 'conv-1',
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the New Task button with tooltip and badge count when skills exist', () => {
    vi.spyOn(teamMemoryManager, 'getTeamMemory').mockReturnValue({
      teamId: mockTeam.id,
      skills: [{ id: 's1', title: 'Vitest', description: 'Testing framework', extractedAt: 1 }],
      systemDirectives: ['Rule 1'],
    });

    render(<TeamNewTaskButton team={mockTeam} />);

    expect(screen.getByText('team.newTask.button')).toBeInTheDocument();
    // Badge shows total skills + directives = 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('triggers confirmation modal when clicking New Task button', () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({
      close: vi.fn(),
      update: vi.fn(),
    }));

    render(<TeamNewTaskButton team={mockTeam} />);

    const button = screen.getByText('team.newTask.button');
    fireEvent.click(button);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'team.newTask.confirmTitle',
        content: 'team.newTask.confirmContent',
        okText: 'team.newTask.confirmOk',
      })
    );
  });

  it('executes resetTeamForNewTask on modal confirmation and notifies success', async () => {
    let capturedOnOk: (() => Promise<void>) | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config: Parameters<typeof Modal.confirm>[0]) => {
      capturedOnOk = config.onOk as () => Promise<void>;
      return { close: vi.fn(), update: vi.fn() };
    });

    const resetMock = vi.spyOn(teamMemoryManager, 'resetTeamForNewTask').mockResolvedValue({
      skills: [{ id: 's1', title: 'React', description: 'Components', extractedAt: 1 }],
      systemDirectives: ['Strict mode'],
    });

    const hideLoadingMock = vi.fn();
    vi.spyOn(Message, 'loading').mockReturnValue(hideLoadingMock);
    const successSpy = vi.spyOn(Message, 'success').mockReturnValue(undefined as unknown as void);

    const onTaskReset = vi.fn();
    render(<TeamNewTaskButton team={mockTeam} onTaskReset={onTaskReset} />);

    // Click button to open confirm
    fireEvent.click(screen.getByText('team.newTask.button'));
    expect(capturedOnOk).toBeDefined();

    // Confirm action wrapped in act
    await act(async () => {
      await capturedOnOk!();
    });

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          team: mockTeam,
        })
      );
      expect(hideLoadingMock).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
      expect(onTaskReset).toHaveBeenCalled();
    });
  });

  it('handles error gracefully when resetTeamForNewTask fails', async () => {
    let capturedOnOk: (() => Promise<void>) | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config: Parameters<typeof Modal.confirm>[0]) => {
      capturedOnOk = config.onOk as () => Promise<void>;
      return { close: vi.fn(), update: vi.fn() };
    });

    vi.spyOn(teamMemoryManager, 'resetTeamForNewTask').mockRejectedValue(new Error('Reset failed'));

    const hideLoadingMock = vi.fn();
    vi.spyOn(Message, 'loading').mockReturnValue(hideLoadingMock);
    const errorSpy = vi.spyOn(Message, 'error').mockReturnValue(undefined as unknown as void);

    render(<TeamNewTaskButton team={mockTeam} />);

    fireEvent.click(screen.getByText('team.newTask.button'));

    await act(async () => {
      await capturedOnOk!();
    });

    await waitFor(() => {
      expect(hideLoadingMock).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('common.unknownError');
    });
  });
});
