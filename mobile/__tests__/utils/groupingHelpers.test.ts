import { buildGroupedHistory, groupConversationsByTimelineAndWorkspace } from '../../src/utils/groupingHelpers';
import type { Conversation } from '../../src/context/ConversationContext';

const t = (key: string): string => {
  const translations: Record<string, string> = {
    'workspace.today': 'Today',
    'workspace.yesterday': 'Yesterday',
    'workspace.recent7Days': 'Last 7 Days',
    'workspace.earlier': 'Earlier',
  };
  return translations[key] || key;
};

const now = Date.now();
const ONE_DAY = 86400000;

const makeConv = (overrides: Partial<Conversation> & { id: string }): Conversation => ({
  name: 'Test',
  type: 'claude',
  createTime: now,
  modifyTime: now,
  model: { id: '', useModel: '' },
  extra: {},
  ...overrides,
});

describe('groupingHelpers', () => {
  describe('buildGroupedHistory', () => {
    it('separates pinned from normal conversations', () => {
      const convs = [
        makeConv({ id: '1', extra: { pinned: true, pinnedAt: now } }),
        makeConv({ id: '2' }),
        makeConv({ id: '3', extra: { pinned: true, pinnedAt: now - 100 } }),
      ];

      const result = buildGroupedHistory(convs, t);
      expect(result.pinnedConversations).toHaveLength(2);
      expect(result.pinnedConversations[0].id).toBe('1');
      expect(result.pinnedConversations[1].id).toBe('3');
    });

    it('returns empty when no conversations', () => {
      const result = buildGroupedHistory([], t);
      expect(result.pinnedConversations).toHaveLength(0);
      expect(result.timelineSections).toHaveLength(0);
    });
  });

  describe('groupConversationsByTimelineAndWorkspace', () => {
    it('groups workspace conversations under workspace groups', () => {
      const convs = [
        makeConv({ id: '1', extra: { workspace: '/proj/a', customWorkspace: true } }),
        makeConv({ id: '2', extra: { workspace: '/proj/a', customWorkspace: true } }),
        makeConv({ id: '3' }),
      ];

      const sections = groupConversationsByTimelineAndWorkspace(convs, t);
      expect(sections.length).toBeGreaterThan(0);

      const todaySection = sections.find((s) => s.timeline === 'Today');
      expect(todaySection).toBeTruthy();

      const wsItem = todaySection!.items.find((i) => i.type === 'workspace');
      expect(wsItem).toBeTruthy();
      expect(wsItem!.workspaceGroup!.conversations).toHaveLength(2);
      expect(wsItem!.workspaceGroup!.displayName).toBe('a');
    });

    it('places non-workspace conversations as standalone items', () => {
      const convs = [makeConv({ id: '1' }), makeConv({ id: '2' })];
      const sections = groupConversationsByTimelineAndWorkspace(convs, t);
      const todaySection = sections.find((s) => s.timeline === 'Today')!;
      expect(todaySection.items.every((i) => i.type === 'conversation')).toBe(true);
    });

    it('assigns correct timeline labels based on time', () => {
      const convs = [
        makeConv({ id: '1', modifyTime: now }),
        makeConv({ id: '2', modifyTime: now - 2 * ONE_DAY }),
        makeConv({ id: '3', modifyTime: now - 10 * ONE_DAY }),
      ];

      const sections = groupConversationsByTimelineAndWorkspace(convs, t);
      const labels = sections.map((s) => s.timeline);
      expect(labels).toContain('Today');
      expect(labels).toContain('Last 7 Days');
      expect(labels).toContain('Earlier');
    });

    it('uses localized temporary workspace labels for workspace groups', () => {
      const localT = (key: string): string => {
        const translations: Record<string, string> = {
          'workspace.today': 'Today',
          'workspace.yesterday': 'Yesterday',
          'workspace.recent7Days': 'Last 7 Days',
          'workspace.earlier': 'Earlier',
          'workspace.temporarySpace': '临时会话',
        };
        return translations[key] || key;
      };

      const convs = [makeConv({ id: '1', extra: { workspace: '/tmp/codex-temp-1700000000', customWorkspace: true } })];

      const sections = groupConversationsByTimelineAndWorkspace(convs, localT);
      const todaySection = sections.find((s) => s.timeline === 'Today');
      const wsItem = todaySection?.items.find((item) => item.type === 'workspace');

      expect(wsItem).toBeTruthy();
      expect(wsItem?.workspaceGroup?.displayName).toContain('临时会话');
      expect(wsItem?.workspaceGroup?.displayName).not.toContain('Temporary Session');
    });
  });
});
