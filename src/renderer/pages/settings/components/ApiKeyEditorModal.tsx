import { Button, Input, Modal, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Delete, Edit, Plus, DeleteFive, CheckSmall, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * API Key 状态
 * API Key status
 */
type KeyStatus = 'pending' | 'testing' | 'valid' | 'invalid';

/**
 * API Key 项
 * API Key item
 */
interface ApiKeyItem {
  id: string;
  value: string;
  status: KeyStatus;
  editing: boolean;
}

interface ApiKeyEditorModalProps {
  visible: boolean;
  apiKeys: string; // 逗号分隔的 API Keys
  onClose: () => void;
  onSave: (apiKeys: string) => void;
  onTestKey?: (key: string) => Promise<boolean>; // 测试单个 key 的回调
}

/**
 * API Key 编辑器弹窗
 * API Key Editor Modal
 */
const ApiKeyEditorModal: React.FC<ApiKeyEditorModalProps> = ({ visible, apiKeys, onClose, onSave, onTestKey }) => {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);

  // 初始化 keys
  useEffect(() => {
    if (visible) {
      const keyList = apiKeys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      if (keyList.length === 0) {
        // 默认添加一个空的输入框
        setKeys([{ id: crypto.randomUUID(), value: '', status: 'pending', editing: true }]);
      } else {
        setKeys(keyList.map((k) => ({ id: crypto.randomUUID(), value: k, status: 'pending', editing: false })));
      }
    }
  }, [visible, apiKeys]);

  // 更新单个 key 的值
  const updateKeyValue = useCallback((id: string, value: string) => {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, value, status: 'pending' } : k)));
  }, []);

  // 切换编辑状态
  const toggleEditing = useCallback((id: string) => {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, editing: !k.editing } : k)));
  }, []);

  // 删除单个 key
  const deleteKey = useCallback((id: string) => {
    setKeys((prev) => {
      const filtered = prev.filter((k) => k.id !== id);
      // 如果删除后没有了，保留一个空的
      if (filtered.length === 0) {
        return [{ id: crypto.randomUUID(), value: '', status: 'pending', editing: true }];
      }
      return filtered;
    });
  }, []);

  // 测试单个 key 的核心逻辑 / Core logic for testing a single key
  const executeKeyTest = useCallback(
    async (id: string, value: string) => {
      if (!onTestKey) return;

      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: 'testing' } : k)));

      try {
        const isValid = await onTestKey(value);
        setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: isValid ? 'valid' : 'invalid' } : k)));
      } catch {
        setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: 'invalid' } : k)));
      }
    },
    [onTestKey]
  );

  // 测试单个 key
  const testKey = useCallback(
    async (id: string) => {
      const key = keys.find((k) => k.id === id);
      if (!key || !key.value.trim()) return;
      await executeKeyTest(id, key.value.trim());
    },
    [keys, executeKeyTest]
  );

  // 添加新的 key 输入框
  const addKey = useCallback(() => {
    setKeys((prev) => [...prev, { id: crypto.randomUUID(), value: '', status: 'pending', editing: true }]);
  }, []);

  // 测试所有 keys
  const testAllKeys = useCallback(async () => {
    const keysToTest = keys.filter((k) => k.value.trim());
    for (const key of keysToTest) {
      await executeKeyTest(key.id, key.value.trim());
    }
  }, [keys, executeKeyTest]);

  // 删除无效的 keys
  const deleteInvalidKeys = useCallback(() => {
    setKeys((prev) => {
      const filtered = prev.filter((k) => k.status !== 'invalid');
      if (filtered.length === 0) {
        return [{ id: crypto.randomUUID(), value: '', status: 'pending', editing: true }];
      }
      return filtered;
    });
  }, []);

  // 保存
  const handleSave = useCallback(() => {
    const validKeys = keys
      .map((k) => k.value.trim())
      .filter(Boolean)
      .join(',');
    onSave(validKeys);
    onClose();
  }, [keys, onSave, onClose]);

  // 是否有多个 key
  const hasMultipleKeys = keys.filter((k) => k.value.trim()).length > 1;
  // 是否有已测试过的 key
  const hasTestedKeys = keys.some((k) => k.status === 'valid' || k.status === 'invalid');
  // 是否有无效的 key
  const hasInvalidKeys = keys.some((k) => k.status === 'invalid');

  // 获取状态图标
  const getStatusIcon = (status: KeyStatus) => {
    switch (status) {
      case 'testing':
        return <Spin size={14} />;
      case 'valid':
        return <CheckOne theme='filled' size={16} className='text-green-500 flex' />;
      case 'invalid':
        return <CloseOne theme='filled' size={16} className='text-red-500 flex' />;
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} onCancel={onClose} title={t('settings.editApiKey')} footer={null} style={{ maxWidth: '500px', width: '90vw' }} unmountOnExit>
      <div className='flex flex-col gap-12px'>
        {/* Key 列表 */}
        <div className='flex flex-col gap-8px max-h-300px overflow-y-auto'>
          {keys.map((key) => (
            <div key={key.id} className='flex items-center gap-8px'>
              <div className='flex-1'>
                <Input value={key.value} onChange={(v) => updateKeyValue(key.id, v)} disabled={!key.editing} placeholder={t('settings.apiKeyPlaceholder')} />
              </div>
              {/* 操作按钮 - 编辑状态时只显示保存按钮 */}
              {key.value.trim() && (
                <div className='flex items-center gap-4px shrink-0'>
                  {key.editing ? (
                    // 编辑状态：只显示保存按钮
                    <Tooltip content={t('common.save')}>
                      <Button type='text' size='mini' icon={<CheckSmall theme='outline' size={16} className='flex' />} onClick={() => toggleEditing(key.id)} status='success' />
                    </Tooltip>
                  ) : (
                    // 非编辑状态：显示状态图标 + 测试 + 编辑 + 删除
                    <>
                      {/* 状态图标 - 在测试按钮左边 */}
                      {key.status !== 'pending' && <div className='flex items-center'>{getStatusIcon(key.status)}</div>}
                      <Tooltip content={t('settings.testKey')}>
                        <Button type='text' size='mini' icon={<Shield theme='outline' size={16} className='flex' />} onClick={() => testKey(key.id)} loading={key.status === 'testing'} />
                      </Tooltip>
                      <Tooltip content={t('common.edit')}>
                        <Button type='text' size='mini' icon={<Edit theme='outline' size={16} className='flex' />} onClick={() => toggleEditing(key.id)} />
                      </Tooltip>
                      <Tooltip content={t('common.delete')}>
                        <Button type='text' size='mini' icon={<Delete theme='outline' size={16} className='flex' />} onClick={() => deleteKey(key.id)} status='danger' />
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 底部操作栏 */}
        <div className='flex items-center justify-between pt-12px border-t border-line-2'>
          <span className='text-11px text-t-secondary'>{t('settings.multiKeyTip')}</span>
          <div className='flex items-center gap-8px'>
            {hasMultipleKeys && (
              <>
                {hasTestedKeys && hasInvalidKeys && (
                  <Tooltip content={t('settings.deleteInvalidKeys')}>
                    <Button type='text' size='small' icon={<DeleteFive theme='outline' size={16} className='flex' />} onClick={deleteInvalidKeys} status='danger' />
                  </Tooltip>
                )}
                <Tooltip content={t('settings.testAllKeys')}>
                  <Button type='text' size='small' icon={<Shield theme='outline' size={16} className='flex' />} onClick={testAllKeys} />
                </Tooltip>
              </>
            )}
            <Button className='flex' type='outline' size='small' icon={<Plus theme='outline' size={14} className='' />} onClick={addKey} style={{ minWidth: 70 }}>
              {t('common.add')}
            </Button>
          </div>
        </div>

        {/* 确认按钮 */}
        <div className='flex justify-end pt-8px'>
          <Button type='primary' onClick={handleSave}>
            {t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ApiKeyEditorModal;
