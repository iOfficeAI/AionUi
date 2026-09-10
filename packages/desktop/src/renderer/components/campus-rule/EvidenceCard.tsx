import React from 'react';
import type { EvidenceItem } from './types';

interface Props {
  data: EvidenceItem[];
}

// ② 依据：引用证据来源（文档感卡片）
// lowRelevance = 弱相关（相关度低于 50%）：整体灰化 + 「辅助依据」，不作为可靠依据呈现
// 相关度数值来自 rag 返回拼入引用末尾的 "[相关度 N%]"（展示层解析，不改数据）；
// 无相关度数值（如 policy 条件匹配原文）时展示「直接依据」类型标记。

/** 从引用原文中提取相关度数值并剥离附加标注（纯展示处理，不修改数据字段） */
function parseRelevance(quote: string): { text: string; relevance?: number } {
  const match = quote.match(/\[相关度\s*(\d+)%\]/);
  const text = quote
    .replace(/\n*\[相关度\s*\d+%\]/g, '')
    .replace(/（相关度较低，仅供参考）/g, '')
    .trim();
  return {
    text,
    relevance: match ? Number(match[1]) : undefined,
  };
}

const EvidenceCard: React.FC<Props> = ({ data }) => {
  return (
    <div className='cr-block'>
      <div className='cr-block-title'>
        <span className='cr-dot' />
        ② 依据 · 引用证据来源
      </div>
      {data.map((item) => {
        const { text, relevance } = parseRelevance(item.quoteContent);
        const isLow = Boolean(item.lowRelevance);

        return (
          <div
            key={item.id}
            className={`cr-evidence${isLow ? ' cr-evidence--low' : ''}`}
          >
            {/* 头部：来源名称 + 类型 Tag */}
            <div className='cr-evidence__head'>
              <span className='cr-evidence__source'>
                <span className='cr-evidence__source-icon'>📄</span>
                {item.fileName}
              </span>
              <span className='cr-evidence__tag'>
                {item.pageNum > 0 ? `第 ${item.pageNum} 页` : '政策原文'}
              </span>
            </div>

            {/* 引用原文（正文剥离相关度标注，突出原文本身） */}
            <p className='cr-evidence__quote'>{text}</p>

            {/* 底部：相关度 / 依据类型 */}
            <div className='cr-evidence__foot'>
              <span className='cr-evidence__relevance'>
                {relevance !== undefined ? `相关度 ${relevance}%` : '来源：政策原文'}
              </span>
              <span className={`cr-evidence__kind${isLow ? ' cr-evidence__kind--low' : ''}`}>
                {isLow ? '⚠ 与当前问题关联较弱 · 仅供参考' : '✓ 直接依据'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EvidenceCard;
