import React from 'react';
import { Table, Tag } from '@arco-design/web-react';
import type { CourseItem } from './types';

const statusColorMap: Record<CourseItem['status'], string> = {
  completed: 'green',
  studying: 'blue',
  planned: 'gray'
};

const statusTextMap: Record<CourseItem['status'], string> = {
  completed: '已修完',
  studying: '修读中',
  planned: '待修读'
};

// 学业进度一览（课程规则工具专属，②依据的可视化展开）
const CoursePlanPanel: React.FC<{ data: CourseItem[] }> = ({ data }) => {
  const columns = [
    {
      title: '课程名称',
      dataIndex: 'courseName',
      width: 160
    },
    {
      title: '学分',
      dataIndex: 'credit',
      width: 80
    },
    {
      title: '学期',
      dataIndex: 'semester',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: CourseItem['status']) => (
        <Tag color={statusColorMap[status]}>{statusTextMap[status]}</Tag>
      )
    },
    {
      title: '成绩',
      dataIndex: 'score',
      render: (score?: number) => score ?? '—'
    }
  ];

  return (
    <div className='cr-block'>
      <div className='cr-block-title'>
        <span className='cr-dot' />
        学业进度一览
      </div>
      <Table columns={columns} data={data} pagination={false} size='small' />
    </div>
  );
};

export default CoursePlanPanel;
