import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ConversationList } from '../../src/components/conversation/ConversationList';
import { NewConversationModal } from '../../src/components/conversation/NewConversationModal';
import { useThemeColor } from '../../src/hooks/useThemeColor';

export default function ConversationsScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const [showNewModal, setShowNewModal] = useState(false);

  const handleCreated = (conversationId: string) => {
    router.push(`/conversation/${conversationId}`);
  };

  return (
    <View style={styles.container}>
      <ConversationList />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: tint }]}
        onPress={() => setShowNewModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <NewConversationModal
        visible={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
