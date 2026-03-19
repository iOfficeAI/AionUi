import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { ChatInputBar } from './ChatInputBar';
import { WorkspacePickerSheet } from './WorkspacePickerSheet';
import { FilePickerSheet } from './FilePickerSheet';
import { ModelPickerSheet } from './ModelPickerSheet';
import { ModePickerSheet, showModeActionSheet } from './ModePickerSheet';
import { useConversations, type AgentInfo } from '../../context/ConversationContext';
import { useThemeColor } from '../../hooks/useThemeColor';
import { bridge } from '../../services/bridge';
import { getAgentModes, supportsModeSwitch } from '../../constants/agentModes';

type AcpModelInfo = {
  currentModelId: string | null;
  currentModelLabel: string | null;
  availableModels: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  source: 'configOption' | 'models';
  configOptionId?: string;
};

type PendingChatScreenProps = {
  agent: AgentInfo;
};

export function PendingChatScreen({ agent }: PendingChatScreenProps) {
  const { t } = useTranslation();
  const { commitNewChat, conversations } = useConversations();
  const [isSending, setIsSending] = useState(false);
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const iconColor = useThemeColor({}, 'icon');

  // State for options
  const [workspace, setWorkspace] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState('default');
  const [modelInfo, setModelInfo] = useState<AcpModelInfo | null>(null);

  // Sheet visibility
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);

  // Probe model info on mount
  useEffect(() => {
    let cancelled = false;
    bridge
      .request<{ success: boolean; data?: { modelInfo: AcpModelInfo | null } }>(
        'acp.probe-model-info',
        { backend: agent.backend },
      )
      .then((res) => {
        if (!cancelled && res?.success && res.data?.modelInfo) {
          setModelInfo(res.data.modelInfo);
          if (res.data.modelInfo.currentModelId) {
            setSelectedModel(res.data.modelInfo.currentModelId);
          }
        }
      })
      .catch(() => {
        // silently fail
      });
    return () => {
      cancelled = true;
    };
  }, [agent.backend]);

  // Recent workspaces from conversations
  const recentWorkspaces = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const conv of conversations) {
      const ws = conv.extra?.workspace;
      if (ws && !seen.has(ws)) {
        seen.add(ws);
        result.push(ws);
      }
    }
    return result;
  }, [conversations]);

  // Mode support
  const modes = useMemo(() => getAgentModes(agent.backend), [agent.backend]);
  const hasModeSwitch = useMemo(() => supportsModeSwitch(agent.backend), [agent.backend]);

  // Model support
  const canSwitchModel = modelInfo?.canSwitch && (modelInfo.availableModels.length ?? 0) > 0;

  // Mutual exclusion: workspace <-> files
  const handleSelectWorkspace = useCallback((ws: string) => {
    setWorkspace(ws);
    setSelectedFiles([]);
  }, []);

  const handleSelectFiles = useCallback((files: string[]) => {
    setSelectedFiles(files);
    setWorkspace('');
  }, []);

  const handleClearSelection = useCallback(() => {
    setWorkspace('');
    setSelectedFiles([]);
  }, []);

  const handleModePress = useCallback(() => {
    // iOS: use ActionSheet
    const handled = showModeActionSheet(modes, selectedMode, setSelectedMode);
    if (!handled) {
      setShowModePicker(true);
    }
  }, [modes, selectedMode]);

  const handleSend = async (text: string) => {
    if (isSending) return;
    setIsSending(true);
    try {
      await commitNewChat(text, {
        ...(workspace ? { workspace, customWorkspace: true } : {}),
        ...(selectedFiles.length > 0 ? { defaultFiles: selectedFiles } : {}),
        ...(selectedMode && selectedMode !== 'default' ? { sessionMode: selectedMode } : {}),
        ...(selectedModel ? { currentModelId: selectedModel } : {}),
      });
    } finally {
      setIsSending(false);
    }
  };

  // Current selection badge
  const hasWorkspace = workspace.length > 0;
  const hasFiles = selectedFiles.length > 0;
  const hasSelection = hasWorkspace || hasFiles;

  // Current mode/model labels for pills
  const currentModeLabel = modes.find((m) => m.value === selectedMode)?.label || selectedMode;
  const currentModelLabel =
    modelInfo?.availableModels.find((m) => m.id === selectedModel)?.label ||
    selectedModel ||
    modelInfo?.currentModelLabel ||
    '';

  // Get display name for workspace
  const workspaceDisplayName = workspace.split('/').filter(Boolean).pop() || workspace;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Hero area */}
      <View style={styles.content}>
        <Ionicons name='chatbubble-ellipses-outline' size={48} color={tint + '40'} />
        <ThemedText style={styles.agentLabel}>{agent.label || agent.name}</ThemedText>
        <ThemedText type='caption'>{t('chat.pendingHint')}</ThemedText>
      </View>

      {/* Selection badge */}
      {hasSelection && (
        <View style={[styles.badge, { backgroundColor: surface, borderColor: border }]}>
          <Ionicons
            name={hasWorkspace ? 'folder-outline' : 'attach'}
            size={16}
            color={tint}
          />
          <ThemedText style={styles.badgeText} numberOfLines={1}>
            {hasWorkspace
              ? workspaceDisplayName
              : t('chat.filesSelected', { count: selectedFiles.length })}
          </ThemedText>
          <TouchableOpacity onPress={handleClearSelection} hitSlop={8}>
            <Ionicons name='close-circle' size={18} color={iconColor} />
          </TouchableOpacity>
        </View>
      )}

      {/* Option pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
        style={styles.pillsScroll}
      >
        <TouchableOpacity
          style={[styles.pill, { borderColor: border }, hasWorkspace && { borderColor: tint }]}
          onPress={() => setShowWorkspacePicker(true)}
          activeOpacity={0.7}
        >
          <Ionicons name='folder-outline' size={15} color={hasWorkspace ? tint : iconColor} />
          <ThemedText
            style={[styles.pillText, hasWorkspace && { color: tint }]}
            numberOfLines={1}
          >
            {t('chat.selectWorkspace')}
          </ThemedText>
          {hasWorkspace && <View style={[styles.dot, { backgroundColor: tint }]} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, { borderColor: border }, hasFiles && { borderColor: tint }]}
          onPress={() => setShowFilePicker(true)}
          activeOpacity={0.7}
        >
          <Ionicons name='attach' size={15} color={hasFiles ? tint : iconColor} />
          <ThemedText style={[styles.pillText, hasFiles && { color: tint }]} numberOfLines={1}>
            {t('chat.selectFiles')}
          </ThemedText>
          {hasFiles && <View style={[styles.dot, { backgroundColor: tint }]} />}
        </TouchableOpacity>

        {canSwitchModel && (
          <TouchableOpacity
            style={[styles.pill, { borderColor: border }]}
            onPress={() => setShowModelPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name='hardware-chip-outline' size={15} color={iconColor} />
            <ThemedText style={styles.pillText} numberOfLines={1}>
              {currentModelLabel || t('chat.selectModel')}
            </ThemedText>
            <Ionicons name='chevron-down' size={12} color={iconColor} />
          </TouchableOpacity>
        )}

        {hasModeSwitch && (
          <TouchableOpacity
            style={[styles.pill, { borderColor: border }]}
            onPress={handleModePress}
            activeOpacity={0.7}
          >
            <Ionicons name='flash-outline' size={15} color={iconColor} />
            <ThemedText style={styles.pillText} numberOfLines={1}>
              {currentModeLabel}
            </ThemedText>
            <Ionicons name='chevron-down' size={12} color={iconColor} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <ChatInputBar onSend={handleSend} disabled={isSending} />

      {/* Sheets */}
      <WorkspacePickerSheet
        visible={showWorkspacePicker}
        workspaces={recentWorkspaces}
        currentWorkspace={workspace}
        onSelect={handleSelectWorkspace}
        onClose={() => setShowWorkspacePicker(false)}
      />
      <FilePickerSheet
        visible={showFilePicker}
        rootDir={workspace || recentWorkspaces[0] || '/'}
        selectedFiles={selectedFiles}
        onDone={handleSelectFiles}
        onClose={() => setShowFilePicker(false)}
      />
      {canSwitchModel && modelInfo && (
        <ModelPickerSheet
          visible={showModelPicker}
          models={modelInfo.availableModels}
          currentModelId={selectedModel}
          onSelect={setSelectedModel}
          onClose={() => setShowModelPicker(false)}
        />
      )}
      {hasModeSwitch && (
        <ModePickerSheet
          visible={showModePicker}
          modes={modes}
          currentMode={selectedMode}
          onSelect={setSelectedMode}
          onClose={() => setShowModePicker(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 32,
  },
  agentLabel: {
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    flex: 1,
    fontSize: 14,
  },
  pillsScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  pillsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
