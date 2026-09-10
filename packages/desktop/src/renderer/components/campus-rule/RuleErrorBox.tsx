import React from 'react';
import { IconExclamationCircleFill, IconCheckCircleFill, IconInfoCircleFill } from '@arco-design/web-react/icon';
import type { ErrorInfo } from './types';

// 异常状态提示（警告 / 失败 / 越界拒绝）
// 低调展示：浅色底 + 细边框 + 小图标，不做大面积红色错误页
const iconMap = {
  warning: <IconExclamationCircleFill style={{ color: 'var(--color-warning-6)' }} />,
  error: <IconExclamationCircleFill style={{ color: 'var(--color-danger-6)' }} />,
  info: <IconCheckCircleFill style={{ color: 'var(--color-primary-6)' }} />,
} as const;

const RuleErrorBox: React.FC<{ info: ErrorInfo }> = ({ info }) => {
  return (
    <div className={`cr-errorbox${info.type === 'error' ? ' cr-errorbox--error' : ''}`}>
      <span className='cr-errorbox__icon'>{iconMap[info.type]}</span>
      <div style={{ minWidth: 0 }}>
        <div className='cr-errorbox__title'>{info.title}</div>
        <div className='cr-errorbox__desc'>{info.description}</div>
      </div>
    </div>
  );
};

export default RuleErrorBox;
