import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DrawerActions } from '@react-navigation/routers';
import { ChatSidebar } from '../../../src/components/chat/ChatSidebar';
import { useThemeColor } from '../../../src/hooks/useThemeColor';
import { useConversations } from '../../../src/context/ConversationContext';

export default function ChatDrawerLayout() {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const navigation = useNavigation();
  const { conversations, activeConversationId } = useConversations();

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
      }}
    >
      <Drawer.Screen name='index' options={{ title: 'Chat' }} />
    </Drawer>
  );
}
