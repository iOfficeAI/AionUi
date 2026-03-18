import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
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
  const navigation = useNavigation();
  const router = useRouter();
  const { conversations, activeConversationId } = useConversations();
  const { currentWorkspace, workspaceDisplayName } = useWorkspace();

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const headerTitle = activeConv?.name || 'Chat';

  return (
    <Drawer
      drawerContent={(props) => <ChatSidebar {...props} />}
      screenOptions={{
        drawerType: 'front',
        drawerStyle: { width: '80%', backgroundColor: background },
        headerShown: true,
        headerTitle,
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
        headerRight: () =>
          currentWorkspace ? (
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/files')}
              style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name='folder-outline' size={18} color={tint} />
              <ThemedText style={{ fontSize: 13, color: tint }} numberOfLines={1}>
                {workspaceDisplayName}
              </ThemedText>
            </TouchableOpacity>
          ) : null,
      }}
    >
      <Drawer.Screen name='index' options={{ title: 'Chat' }} />
    </Drawer>
  );
}
