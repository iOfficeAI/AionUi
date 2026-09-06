/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `/split/:groupId` when the group has collapsed to one visible member. The
 * route never writes on list absence; it asks the write path to count the
 * group against the backend and clear a leftover tag only if nobody else
 * carries it, and it navigates to the survivor straight away either way.
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

const navigate = vi.fn();
const dissolveIfAlone = vi.fn(async () => {});

vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'g' }),
  useLocation: () => ({ pathname: '/split/g', state: null }),
  useNavigate: () => navigate,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations', () => ({
  useSplitGroupMutations: () => ({ dissolveIfAlone }),
}));
vi.mock('@/renderer/pages/split/SplitGroupView', () => ({ default: () => <div data-testid='split-view' /> }));

let contextValue: {
  conversations: TChatConversation[];
  listLoaded: boolean;
  groupedHistory: { splitGroups: Array<{ id: string; members: TChatConversation[] }> };
};
vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => contextValue,
}));

import SplitGroupIndex from '@/renderer/pages/split/index';

const row = (id: string, group_id?: string): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { split_group: group_id ? { id: group_id, order: 0 } : null },
  }) as TChatConversation;

describe('SplitGroupIndex: a group that shows one member', () => {
  beforeEach(() => {
    navigate.mockClear();
    dissolveIfAlone.mockClear();
  });

  it('asks for the count and goes to the survivor', async () => {
    contextValue = { conversations: [row('a', 'g')], listLoaded: true, groupedHistory: { splitGroups: [] } };
    render(<SplitGroupIndex />);
    await waitFor(() => expect(dissolveIfAlone).toHaveBeenCalledWith('g'));
    expect(navigate).toHaveBeenCalledWith('/conversation/a', { replace: true });
  });

  it('asks once, however often the effect re-runs', async () => {
    contextValue = { conversations: [row('a', 'g')], listLoaded: true, groupedHistory: { splitGroups: [] } };
    const view = render(<SplitGroupIndex />);
    view.rerender(<SplitGroupIndex />);
    view.rerender(<SplitGroupIndex />);
    await waitFor(() => expect(dissolveIfAlone).toHaveBeenCalledTimes(1));
  });

  it('writes nothing and shows the columns while the group is whole', async () => {
    const members = [row('a', 'g'), row('b', 'g')];
    contextValue = {
      conversations: members,
      listLoaded: true,
      groupedHistory: { splitGroups: [{ id: 'g', members }] },
    };
    const view = render(<SplitGroupIndex />);
    expect(view.getByTestId('split-view')).toBeTruthy();
    expect(dissolveIfAlone).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('writes nothing before the list has loaded', () => {
    contextValue = { conversations: [], listLoaded: false, groupedHistory: { splitGroups: [] } };
    render(<SplitGroupIndex />);
    expect(dissolveIfAlone).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('writes nothing when no conversation carries the tag at all', () => {
    contextValue = { conversations: [row('a')], listLoaded: true, groupedHistory: { splitGroups: [] } };
    const view = render(<SplitGroupIndex />);
    expect(view.getByTestId('split-group-missing')).toBeTruthy();
    expect(dissolveIfAlone).not.toHaveBeenCalled();
  });
});
