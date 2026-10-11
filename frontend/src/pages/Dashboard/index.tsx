import React from 'react';
import { Card, Row, Col, Table, Statistic } from 'antd';
import { PageHeader, StatCard } from '@/components';
import { useTrend, useTopRules } from '@/hooks/useStats';
import { RiseOutlined, FallOutlined, TrophyOutlined } from '@ant-design/icons';

const Dashboard: React.FC = () => {
  const { data: trend } = useTrend();
  const { data: topRules } = useTopRules();

  const dailyData = (trend?.dailyData || []).slice().sort(
    (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date)
  );
  const totalEvents = dailyData.reduce((sum, d) => sum + d.total, 0);
  const highEvents = dailyData.reduce((sum, d) => sum + d.high, 0);

  const trendColumns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '总风险事件', dataIndex: 'total', key: 'total' },
    {
      title: '高风险事件',
      dataIndex: 'high',
      key: 'high',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#ff4d4f' : undefined, fontWeight: v > 0 ? 600 : undefined }}>
          {v}
        </span>
      ),
    },
  ];

  const topRuleColumns = [
    { title: '排名', key: 'rank', width: 60, render: (_: unknown, __: unknown, index: number) => (
      <span style={{
        width: 24, height: 24, borderRadius: '50%', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12,
        background: index < 3 ? '#3b82f6' : 'transparent',
        color: index < 3 ? '#fff' : undefined,
      }}>
        {index + 1}
      </span>
    )},
    { title: '规则名称', dataIndex: 'ruleName', key: 'ruleName' },
    { title: '命中次数', dataIndex: 'hitCount', key: 'hitCount',
      sorter: (a: { hitCount: number }, b: { hitCount: number }) => b.hitCount - a.hitCount,
      defaultSortOrder: 'descend' as const,
    },
  ];

  return (
    <div>
      <PageHeader title="数据看板" />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <StatCard title="7天总风险事件" value={totalEvents} icon={<RiseOutlined />} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard title="7天高风险事件" value={highEvents} icon={<FallOutlined />}
            valueStyle={{ color: highEvents > 0 ? '#ff4d4f' : undefined }} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard title="今日命中规则数" value={(topRules?.topRules || []).length} icon={<TrophyOutlined />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="风险趋势（近7天）" bordered={false}>
            <Table
              dataSource={dailyData}
              columns={trendColumns}
              rowKey="date"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="规则命中排行（今日）" bordered={false}>
            <Table
              dataSource={topRules?.topRules || []}
              columns={topRuleColumns}
              rowKey="ruleName"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
