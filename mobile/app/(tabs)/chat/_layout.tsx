import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DrawerActions } from '@react-navigation/routers';
import { ChatSidebar } from '../../../src/components/chat/ChatSidebar';
import { useThemeColor } from '../../../src/hooks/useThemeColor';
import { useConversations } from '../../../src/context/ConversationContext';
import { useWorkspace } from '../../../src/context/WorkspaceContext';
import { ThemedText } from '../../../src/components/ui/ThemedText';

export default function ChatDrawerLayout() {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const navigation = useNavigation();
  const { conversations, activeConversationId } = useConversations();
  const { currentWorkspace, workspaceDisplayName } = useWorkspace();

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const conversationName = activeConv?.name || 'Chat';

  return (
    <Drawer
      drawerContent={(props) => <ChatSidebar {...props} />}
      screenOptions={{
        drawerType: 'front',
        drawerStyle: { width: '80%', backgroundColor: background },
        headerShown: true,
        headerTitle: () => (
          <View style={{ alignItems: 'center' }}>
            <ThemedText
              style={{ fontSize: 17, fontWeight: '600', color: text }}
              numberOfLines={1}
            >
              {conversationName}
            </ThemedText>
            {currentWorkspace && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name='folder-outline' size={11} color={textSecondary} />
                <ThemedText
                  style={{ fontSize: 12, color: textSecondary }}
                  numberOfLines={1}
                >
                  {workspaceDisplayName}
                </ThemedText>
              </View>
            )}
          </View>
        ),
        headerTintColor: text,
        headerStyle: { backgroundColor: background },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
            style={{ marginLeft: 16 }}
          >
            <Ionicons name='menu' size={24} color={tint} />
          </TouchableOpacity>
        ),
      }}
    >
      <Drawer.Screen name='index' options={{ title: 'Chat' }} />
    </Drawer>
  );
}
