import {
  BarChartOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PieChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Button, Card, Progress, Tag } from 'antd';
import { MetricCard, SectionTitle } from '../components/Ui';
import type { Metric, Tone } from '../types';

const vulnerabilityMetrics: Metric[] = [
  { label: '漏洞总数', value: '2,845', trend: '+4.70%', tone: 'gray' },
  { label: '高危漏洞', value: '326', trend: '+5.84%', tone: 'red' },
  { label: '中危漏洞', value: '982', trend: '+3.80%', tone: 'orange' },
  { label: '待修复', value: '1,256', trend: '+6.26%', tone: 'purple' },
  { label: '待复测', value: '368', trend: '-3.16%', tone: 'blue' },
];

const reportMetrics: Metric[] = [
  { label: '报告总数', value: '1,286', trend: '+8.20%', tone: 'gray' },
  { label: '本周新增', value: '42', trend: '+12.50%', tone: 'red' },
  { label: '待导出', value: '18', trend: '+6.30%', tone: 'orange' },
  { label: '已导出', value: '1,102', trend: '+5.10%', tone: 'blue' },
  { label: '待确认', value: '24', trend: '-4.00%', tone: 'purple' },
  { label: '本月交付', value: '86', trend: '+18.60%', tone: 'green' },
];

const severityItems = [
  ['严重', '18', 'severe'],
  ['高危', '142', 'high'],
  ['中危', '468', 'medium'],
  ['低危', '1,812', 'low'],
] as const;

function DonutCard({ title, total, centerLabel = '漏洞总数' }: { title: string; total: string; centerLabel?: string }) {
  return (
    <Card variant="borderless" className="overview-chart-card">
      <SectionTitle icon={<PieChartOutlined />} title={title} />
      <div className="risk-content compact">
        <div className="risk-donut">
          <div><span>{centerLabel}</span><strong>{total}</strong></div>
        </div>
        <ul>
          {severityItems.map(([label, value, tone]) => (
            <li key={label}><i className={`dot ${tone}`} />{label}<strong>{value}</strong></li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function MiniTrend({ bars = false }: { bars?: boolean }) {
  return (
    <div className={bars ? 'mini-bars' : 'mini-lines'} aria-label={bars ? '柱状趋势图' : '折线趋势图'}>
      {bars
        ? [13, 15, 18, 17, 17, 10, 8, 4, 11, 18, 17, 16, 15, 14, 12, 10].map((value, index) => <i key={index} style={{ height: `${value * 7}px` }} />)
        : <svg viewBox="0 0 500 190"><polyline points="0,150 65,125 130,110 195,55 260,35 325,95 390,145 450,100 500,42" /><polyline className="green-line" points="0,145 65,120 130,85 195,92 260,65 325,54 390,88 450,92 500,45" /></svg>}
      <div className="axis-labels"><span>05-30</span><span>05-31</span><span>06-01</span><span>06-03</span></div>
    </div>
  );
}

export function VulnerabilityOverviewPage() {
  const assets = [['核心业务系统', 728], ['电商平台', 532], ['会员中心', 412], ['支付系统', 326], ['数据中台', 268]];
  const recommendations = [
    ['P0', '优先修复支付未授权访问', '影响核心交易系统，存在资金风险。', 'red'],
    ['P0', '处置 2 个反序列化 RCE', '建议立即升级组件版本。', 'red'],
    ['P1', '收敛 Redis 未授权暴露', '增加认证并限制访问来源。', 'orange'],
    ['P2', '清理后台弱口令', '强制改密并开启二次认证。', 'green'],
  ];
  return (
    <div className="page vulnerability-overview">
      <div className="overview-with-aside">
        <main>
          <div className="metric-grid metric-grid-five">{vulnerabilityMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
          <div className="overview-grid-three">
            <DonutCard title="风险分布" total="2,845" />
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="漏洞趋势" /><MiniTrend /></Card>
            <DonutCard title="来源模块分布" total="2,845" />
          </div>
          <div className="overview-grid-three">
            <DonutCard title="受影响资产类型分布" total="2,845" centerLabel="受影响资产" />
            <Card variant="borderless" className="overview-chart-card">
              <SectionTitle icon={<SafetyCertificateOutlined />} title="同步及业务资产 Top 5" />
              <div className="rank-bars">{assets.map(([name, value], index) => <div key={name}><span>{name}</span><Progress percent={88 - index * 11} showInfo={false} /><b>{value}</b></div>)}</div>
            </Card>
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="漏洞修复趋势" /><MiniTrend bars /></Card>
          </div>
          <div className="overview-lists">
            <Card variant="borderless"><SectionTitle icon={<FileTextOutlined />} title="最近新增漏洞" action={<a>查看全部 →</a>} /><SimpleRows /></Card>
            <Card variant="borderless"><SectionTitle icon={<SafetyCertificateOutlined />} title="高危漏洞 Top 5" action={<a>查看全部 →</a>} /><SimpleRows ranked /></Card>
          </div>
        </main>
        <aside className="risk-insight">
          <Card variant="borderless">
            <SectionTitle icon={<RobotOutlined />} title="AI 风险一览" action={<Tag color="blue">今日</Tag>} />
            <div className="insight-copy">当前平台共管理<strong>2,845</strong>个漏洞，其中<strong className="danger-text">326</strong>个严重、<strong className="warning-text">982</strong>个高危。建议优先处置支付未授权与反序列化 RCE 类问题。</div>
            <h4><ToolOutlined /> 整体修复进度</h4>
            <div className="repair-progress"><b>整体修复进度 <strong>56%</strong></b><Progress percent={56} showInfo={false} /></div>
            <h4><CheckCircleOutlined /> 推荐处理项</h4>
            {recommendations.map(([level, title, text, tone]) => <div className={`recommendation ${tone}`} key={title}><Tag color={tone}>{level}</Tag><div><strong>{title}</strong><p>{text}</p></div></div>)}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SimpleRows({ ranked = false }: { ranked?: boolean }) {
  const rows = ['支付接口未授权访问', 'Fastjson 远程代码执行', 'Redis 未授权访问', '订单遍历越权', '管理后台弱口令'];
  return <div className="simple-rows">{rows.map((row, index) => <div key={row}>{ranked && <b>{index + 1}</b>}<span>{row}</span><Tag color={index < 2 ? 'red' : index === 2 ? 'orange' : 'blue'}>{index < 2 ? '严重' : index === 2 ? '高危' : '中危'}</Tag><time>05-{18 - index}</time></div>)}</div>;
}

export function ReportOverviewPage() {
  const recent = ['12.20 安全事件应急响应报告', 'XX 公司外网渗透测试报告', '核心交易系统代码审计报告', 'Q4 安全态势数据分析报告', '电商平台内网渗透测试报告'];
  return (
    <div className="page report-overview">
      <div className="metric-grid metric-grid-six">{reportMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="report-chart-grid">
        <DonutCard title="报告来源分布" total="1,286" centerLabel="报告总数" />
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="报告生成趋势" /><MiniTrend bars /></Card>
        <DonutCard title="报告等级分布" total="1,286" centerLabel="风险报告" />
      </div>
      <div className="recent-report-section">
        <div className="section-heading"><h3>最近新增报告</h3><a>查看全部 →</a></div>
        <div className="recent-report-cards">{recent.map((name, index) => <Card key={name} variant="borderless"><Tag color={(['purple', 'red', 'blue', 'green'] as Tone[])[index % 4]}>{['应急响应', '渗透测试', '代码审计', '数据分析'][index % 4]}</Tag><time>12-{20 - index}</time><strong>{name}</strong><span>安全专家 {index + 1}</span></Card>)}</div>
      </div>
      <div className="report-bottom-grid">
        <Card variant="borderless"><SectionTitle icon={<FileTextOutlined />} title="最近导出的报告" action={<a>查看全部 →</a>} /><SimpleRows /></Card>
        <Card variant="borderless" className="report-insight"><SectionTitle icon={<RobotOutlined />} title="报告洞察" /><div className="insight-copy">平台累计产出<strong>1,286</strong>份安服报告，本周新增<strong>42</strong>份，本月已交付<strong>86</strong>份。</div><ul><li>本周报告高危漏洞集中在支付接口与订单遍历类问题。</li><li>建议优先交付 12.20 安全事件应急响应报告。</li><li>待确认报告 24 份，建议本周内集中收口。</li></ul><Button type="link">查看报告列表 →</Button></Card>
      </div>
    </div>
  );
}
