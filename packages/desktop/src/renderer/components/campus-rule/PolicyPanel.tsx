import React from 'react';
import type { PolicyHit } from './types';

interface Props {
  data: PolicyHit[];
}

// 政策检索命中条款（政策检索工具专属）
// 数据与 AnswerTemplate 同源：仅视觉与 EvidenceCard 保持一致（文档感）
const PolicyPanel: React.FC<Props> = ({ data }) => {
  return (
    <div className='cr-block'>
      <div className='cr-block-title'>
        <span className='cr-dot' />
        政策条款命中
      </div>
      {data.map((item) => (
        <div key={item.id} className='cr-policy'>
          <div className='cr-policy__head'>
            <span className='cr-policy__title'>📑 {item.title}</span>
            <span className='cr-evidence__tag'>{item.source}</span>
          </div>
          <div>
            {item.keywords.map((kw) => (
              <span key={kw} className='cr-policy__kw'>
                {kw}
              </span>
            ))}
          </div>
          <p className='cr-policy__quote'>{item.quoteContent}</p>
        </div>
      ))}
    </div>
  );
};

export default PolicyPanel;
