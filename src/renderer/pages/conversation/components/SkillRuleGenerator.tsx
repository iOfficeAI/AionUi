import React, { useState, useEffect } from 'react';
import { Button, Modal, Radio, Message, Dropdown, Menu, List, Spin, Empty, Typography, Input } from '@arco-design/web-react';
import { Magic, FolderOpen, Lightning } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import type { TMessage } from '@/common/chatLib';
import type { IDirOrFile } from '@/common/ipcBridge';
import type { AcpBackendConfig } from '@/types/acpTypes';

interface SkillRuleGeneratorProps {
  conversationId: string;
  workspace?: string;
}

const LoadRuleModal: React.FC<{
  visible: boolean;
  onCancel: () => void;
  workspace?: string;
  conversationId: string;
}> = ({ visible, onCancel, workspace, conversationId }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (visible && workspace) {
      void loadFiles();
    }
  }, [visible, workspace]);

  const loadFiles = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      // Fetch files from workspace
      const result = await ipcBridge.fs.getFilesByDir.invoke({ dir: workspace, root: workspace });
      // Helper to flatten tree and filter
      const flattenFiles = (nodes: IDirOrFile[]): IDirOrFile[] => {
        let acc: IDirOrFile[] = [];
        for (const node of nodes) {
          if (node.isFile) {
            if (/\.(json|md|py|txt)$/i.test(node.name)) {
              acc.push(node);
            }
          } else if (node.children) {
            acc = acc.concat(flattenFiles(node.children));
          }
        }
        return acc;
      };

      const flatList = result && result.length > 0 && result[0].children ? flattenFiles(result[0].children) : [];
      // Sort by name
      flatList.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(flatList);
    } catch (error) {
      console.error('Failed to load files:', error);
      Message.error(t('conversation.skill_generator.load_error', { defaultValue: 'Failed to load files' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (file: IDirOrFile) => {
    setLoadingFile(true);
    try {
      const content = await ipcBridge.fs.readFile.invoke({ path: file.fullPath });
      const prompt = `
System Instruction: The user has explicitly loaded the following rule/skill. Please internalize and apply it to our conversation immediately.

Filename: ${file.name}

Content:
\`\`\`
${content}
\`\`\`

Please acknowledge receiving this rule/skill and confirm you will apply it.
      `.trim();

      await ipcBridge.conversation.sendMessage.invoke({
        input: prompt,
        msg_id: uuid(),
        conversation_id: conversationId,
      });

      Message.success(t('conversation.skill_generator.rule_loaded', { defaultValue: 'Rule loaded successfully' }));
      onCancel();
    } catch (error) {
      console.error('Failed to read file:', error);
      Message.error(t('conversation.skill_generator.read_error', { defaultValue: 'Failed to read file' }));
    } finally {
      setLoadingFile(false);
    }
  };

  return (
    <Modal title={t('conversation.skill_generator.load_title', { defaultValue: 'Load Rule/Skill' })} visible={visible} onCancel={onCancel} footer={null} style={{ width: 500 }}>
      <Spin loading={loading} style={{ display: 'block' }}>
        {files.length === 0 ? (
          <Empty description={t('conversation.skill_generator.no_files', { defaultValue: 'No relevant files found in workspace' })} />
        ) : (
          <List
            dataSource={files}
            render={(file, index) => (
              <List.Item key={index} actionLayout='vertical' style={{ cursor: 'pointer', padding: '12px 0' }} onClick={() => handleSelectFile(file)} className='hover:bg-[var(--color-fill-2)] px-2 rounded transition-colors'>
                <div className='flex items-center gap-3'>
                  <div className='bg-[var(--color-primary-light-1)] p-2 rounded'>{file.name.endsWith('.py') ? <Lightning size={18} fill='var(--color-primary-6)' /> : <FolderOpen size={18} fill='var(--color-primary-6)' />}</div>
                  <div className='flex-1'>
                    <Typography.Text bold>{file.name}</Typography.Text>
                    <div className='text-[var(--color-text-3)] text-xs truncate'>{file.relativePath || file.name}</div>
                  </div>
                  {loadingFile && <Spin size={16} />}
                </div>
              </List.Item>
            )}
          />
        )}
      </Spin>
    </Modal>
  );
};

const SkillRuleGenerator: React.FC<SkillRuleGeneratorProps> = ({ conversationId, workspace }) => {
  const { t } = useTranslation();
  const [generateVisible, setGenerateVisible] = useState(false);
  const [loadVisible, setLoadVisible] = useState(false);
  const [type, setType] = useState<'skill' | 'rule'>('skill');
  const [presetName, setPresetName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!workspace) {
      Message.error(t('conversation.skill_generator.no_workspace', { defaultValue: 'No workspace available' }));
      return;
    }

    if (!presetName.trim()) {
      Message.warning(t('conversation.skill_generator.name_required', { defaultValue: 'Please enter a name for the preset' }));
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch conversation history
      const pageSize = 50;
      const MAX_CHARS = 30000;

      const messages = await ipcBridge.database.getConversationMessages.invoke({
        conversation_id: conversationId,
        pageSize: pageSize,
      });

      if (!messages || messages.length === 0) {
        Message.warning(t('conversation.skill_generator.no_history', { defaultValue: 'No conversation history found' }));
        setLoading(false);
        return;
      }

      let historyText = messages
        .map((msg: TMessage) => {
          if (msg.type === 'text') {
            const role = msg.position === 'right' ? 'User' : 'Assistant';
            return `${role}: ${msg.content.content}`;
          }
          return null;
        })
        .filter(Boolean)
        .join('\n\n');

      if (historyText.length > MAX_CHARS) {
        historyText = '...[History Truncated]...\n' + historyText.slice(-MAX_CHARS);
      }

      // 2. Construct prompt
      const finalName = presetName.trim();
      const prompt = `
Based on the following conversation history, please generate a ${type === 'skill' ? 'Python script (Skill)' : 'Rule file (JSON/Markdown)'} for a specialized agent named "${finalName}".

Context:
${historyText}

Requirements:
- If 'Skill': Create a reusable Python script. Save it as a .py file in the workspace (e.g., skill_${finalName.toLowerCase().replace(/\s+/g, '_')}.py).
- If 'Rule': Create a structured rule definition (JSON or Markdown). Save it as a .json or .md file in the workspace (e.g., rule_${finalName.toLowerCase().replace(/\s+/g, '_')}.json).
- Use the 'write_file' tool to save the file directly.
- VERY IMPORTANT: Additionally, output the EXACT content of the generated rule/skill between ---PRESET_BEGIN--- and ---PRESET_END--- tags so I can register it as a global preset.
- After saving, reply with a brief confirmation.
      `.trim();

      const msg_id = uuid();
      let capturedContent = '';

      // Listen for the response to capture preset content
      const removeListener = ipcBridge.conversation.responseStream.on((msg) => {
        if (msg.conversation_id === conversationId && msg.msg_id === msg_id) {
          if (msg.type === 'content') {
            capturedContent += msg.data as string;
          } else if (msg.type === 'finish') {
            // Extract content between tags
            const match = capturedContent.match(/---PRESET_BEGIN---([\s\S]*?)---PRESET_END---/);
            if (match && match[1]) {
              void registerPreset(finalName, match[1].trim());
            }
            removeListener();
          }
        }
      });

      // 3. Send prompt to the agent
      await ipcBridge.conversation.sendMessage.invoke({
        input: prompt,
        msg_id: msg_id,
        conversation_id: conversationId,
      });

      setGenerateVisible(false);
      setPresetName('');
      Message.success(t('conversation.skill_generator.request_sent', { defaultValue: 'Request sent to agent' }));
    } catch (error) {
      console.error('Failed to generate skill/rule:', error);
      Message.error(t('conversation.skill_generator.failed', { defaultValue: 'Failed to generate' }));
    } finally {
      setLoading(false);
    }
  };

  const registerPreset = async (name: string, content: string) => {
    try {
      const customAgents = ((await ConfigStorage.get('acp.customAgents')) ?? []) as AcpBackendConfig[];
      const presetAgent: AcpBackendConfig = {
        id: uuid(),
        name,
        enabled: true,
        isPreset: true,
        context: content,
      };
      customAgents.push(presetAgent);
      await ConfigStorage.set('acp.customAgents', customAgents);
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      Message.success(t('conversation.skill_generator.preset_registered', { defaultValue: 'Agent preset registered successfully!' }));
    } catch (error) {
      console.error('Failed to register preset:', error);
    }
  };

  const menu = (
    <Menu>
      <Menu.Item key='generate' onClick={() => setGenerateVisible(true)}>
        <div className='flex items-center gap-2'>
          <Magic />
          {t('conversation.skill_generator.menu_generate', { defaultValue: 'Generate from History' })}
        </div>
      </Menu.Item>
      <Menu.Item key='load' onClick={() => setLoadVisible(true)}>
        <div className='flex items-center gap-2'>
          <FolderOpen />
          {t('conversation.skill_generator.menu_load', { defaultValue: 'Load Rule/Skill' })}
        </div>
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      <Dropdown droplist={menu} trigger='click' position='br'>
        <Button type='text' icon={<Magic />} style={{ color: 'var(--color-text-2)' }} aria-label={t('conversation.skill_generator.title', { defaultValue: 'Skill & Rules' })} />
      </Dropdown>

      {/* Generate Modal */}
      <Modal title={t('conversation.skill_generator.title', { defaultValue: 'Generate Skill/Rule' })} visible={generateVisible} onOk={handleGenerate} onCancel={() => setGenerateVisible(false)} okText={t('conversation.skill_generator.generate', { defaultValue: 'Generate' })} confirmLoading={loading}>
        <div style={{ marginBottom: 16 }}>
          <div className='mb-4'>
            <Typography.Text>{t('conversation.skill_generator.name_label', { defaultValue: 'Agent Name:' })}</Typography.Text>
            <Input className='mt-2' placeholder={t('conversation.skill_generator.name_placeholder', { defaultValue: 'e.g. Excel Translator' })} value={presetName} onChange={setPresetName} />
          </div>
          <p>{t('conversation.skill_generator.description', { defaultValue: 'Analyze conversation history to generate:' })}</p>
        </div>
        <Radio.Group value={type} onChange={setType}>
          <Radio value='skill'>{t('conversation.skill_generator.type_skill', { defaultValue: 'Skill (Python)' })}</Radio>
          <Radio value='rule'>{t('conversation.skill_generator.type_rule', { defaultValue: 'Rule (JSON/MD)' })}</Radio>
        </Radio.Group>
      </Modal>

      {/* Load Modal */}
      <LoadRuleModal visible={loadVisible} onCancel={() => setLoadVisible(false)} workspace={workspace} conversationId={conversationId} />
    </>
  );
};

export default SkillRuleGenerator;
