import type { TChatConversation } from '@/common/config/storage';
import { mergeProjectConversationPage } from '@/renderer/pages/conversation/GroupedHistory/hooks/useProjectConversations';

const conversation = (id: string): TChatConversation => ({ id }) as TChatConversation;

describe('project conversation pagination', () => {
  it('appends the next page and removes duplicate conversations', () => {
    const result = mergeProjectConversationPage(
      [conversation('1'), conversation('2'), conversation('3')],
      [conversation('3'), conversation('4'), conversation('5')],
      false
    );

    expect(result.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('resets expanded conversations to the latest page', () => {
    const result = mergeProjectConversationPage(
      Array.from({ length: 10 }, (_, index) => conversation(String(index + 1))),
      Array.from({ length: 5 }, (_, index) => conversation(String(index + 1))),
      true
    );

    expect(result.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  });
});
