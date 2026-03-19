/**
 * AddCustomPathModal — Modal for adding a custom external skill directory path.
 */
import { ipcBridge } from '@/common';
import { Button, Input, Modal } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type AddCustomPathModalProps = {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  customPathName: string;
  setCustomPathName: (v: string) => void;
  customPathValue: string;
  setCustomPathValue: (v: string) => void;
};

const AddCustomPathModal: React.FC<AddCustomPathModalProps> = ({
  visible,
  onCancel,
  onOk,
  customPathName,
  setCustomPathName,
  customPathValue,
  setCustomPathValue,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('settings.skillsHub.addCustomPath', { defaultValue: '添加自定义技能路径' })}
      visible={visible}
      onCancel={onCancel}
      onOk={onOk}
      okText={t('common.confirm', { defaultValue: '确认' })}
      cancelText={t('common.cancel', { defaultValue: '取消' })}
      okButtonProps={{ disabled: !customPathName.trim() || !customPathValue.trim() }}
      autoFocus={false}
      focusLock
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <div className='flex flex-col gap-16px'>
        <div>
          <div className='text-13px font-medium text-t-primary mb-8px'>
            {t('common.name', { defaultValue: '名称' })}
          </div>
          <Input
            placeholder={t('settings.skillsHub.customPathNamePlaceholder', { defaultValue: '例：我的自定义技能' })}
            value={customPathName}
            onChange={(v) => setCustomPathName(v)}
            className='rd-6px'
          />
        </div>
        <div>
          <div className='text-13px font-medium text-t-primary mb-8px'>
            {t('settings.skillsHub.customPathLabel', { defaultValue: '技能目录路径' })}
          </div>
          <div className='flex gap-8px'>
            <Input
              placeholder={t('settings.skillsHub.customPathPlaceholder', {
                defaultValue: '例：C:\\Users\\me\\.mytools\\skills',
              })}
              value={customPathValue}
              onChange={(v) => setCustomPathValue(v)}
              className='flex-1 rd-6px'
            />
            <Button
              className='rd-6px'
              onClick={async () => {
                try {
                  const result = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
                  if (result && result.length > 0) {
                    setCustomPathValue(result[0]);
                  }
                } catch (e) {
                  console.error('Failed to select directory', e);
                }
              }}
            >
              <FolderOpen size={16} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AddCustomPathModal;
