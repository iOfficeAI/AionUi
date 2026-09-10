import React from 'react';
import type { ConditionGroup, ConditionRow } from './types';
import './campus-rule.css';

// ========== 逐条条件比对表（policy 判定器专属） ==========
// 展示「条件 × 你的值 × 政策要求 × 状态」，把 query_policy 的判定过程可视化。
// 支持两种形态：
//   groups：按类别分组（成绩/外语/科研/竞赛…），一眼看清政策卡在哪些方面；
//   data：平铺列表（category_matches 缺失时兜底，如旧数据/精简返回）。
// 视觉：低饱和状态色，不喧宾夺主；移动端每行转卡片式。

const stateMap: Record<ConditionRow['match'], { cls: string; text: string }> = {
  met: { cls: 'cr-ct__state--met', text: '✓ 满足' },
  not_met: { cls: 'cr-ct__state--not-met', text: '✗ 未满足' },
  missing_info: { cls: 'cr-ct__state--missing', text: '⚠ 未提供' },
  needs_manual_review: { cls: 'cr-ct__state--review', text: '● 需核实' },
};

const RowList: React.FC<{ rows: ConditionRow[] }> = ({ rows }) => (
  <>
    {rows.map((row) => {
      const st = stateMap[row.match] ?? stateMap.needs_manual_review;
      return (
        <div key={row.id} className='cr-ct__row'>
          <div className='cr-ct__cell cr-ct__item'>{row.item}</div>
          <div className='cr-ct__cell cr-ct__value'>{row.userValue ?? '未提供'}</div>
          <div className='cr-ct__cell cr-ct__req'>{row.requirement ?? '—'}</div>
          <div className='cr-ct__cell'>
            <span className={`cr-ct__state ${st.cls}`}>{st.text}</span>
          </div>
        </div>
      );
    })}
  </>
);

const ConditionTable: React.FC<{ data?: ConditionRow[]; groups?: ConditionGroup[] }> = ({ data, groups }) => {
  const hasGroups = !!groups && groups.length > 0;
  return (
    <div className='cr-block cr-ct'>
      <div className='cr-block-title'>
        <span className='cr-dot' />
        条件比对
      </div>
      {hasGroups ? (
        // 分组形态：每组一个分组容器（组标签 + 组内行）
        <div className='cr-ct__groups'>
          {groups!.map((g) => (
            <div key={g.id} className='cr-ct__group'>
              <div className='cr-ct__group-label'>
                <span className='cr-ct__group-name'>{g.label}</span>
                <span className='cr-ct__group-count'>{g.rows.length} 项</span>
              </div>
              <div className='cr-ct__table'>
                <div className='cr-ct__row cr-ct__head'>
                  <div className='cr-ct__cell'>条件</div>
                  <div className='cr-ct__cell'>你的值</div>
                  <div className='cr-ct__cell'>政策要求</div>
                  <div className='cr-ct__cell'>状态</div>
                </div>
                <RowList rows={g.rows} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        // 平铺形态（兜底）
        <div className='cr-ct__table'>
          <div className='cr-ct__row cr-ct__head'>
            <div className='cr-ct__cell'>条件</div>
            <div className='cr-ct__cell'>你的值</div>
            <div className='cr-ct__cell'>政策要求</div>
            <div className='cr-ct__cell'>状态</div>
          </div>
          {data && <RowList rows={data} />}
        </div>
      )}
    </div>
  );
};

export default ConditionTable;
