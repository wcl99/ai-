import {
  BarChartOutlined,
  BugOutlined,
  CodeOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  KeyOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Card, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { MetricCard, SectionTitle } from '../components/Ui';
import { dashboardMetrics, tasks } from '../data/mock';

const featureCards = [
  { title: 'AI 渗透测试', desc: '智能化渗透测试与漏洞发现', icon: <RadarChartOutlined />, tone: 'red' },
  { title: 'AI 应急响应', desc: '自动化研判与智能处置建议', icon: <ThunderboltOutlined />, tone: 'purple' },
  { title: 'AI 代码审计', desc: '静态分析与逻辑漏洞挖掘', icon: <CodeOutlined />, tone: 'blue' },
  { title: 'AI 数据分析', desc: '多维数据聚合与趋势洞察', icon: <BarChartOutlined />, tone: 'green' },
];

const quickLinks = [
  ['资产中心', <DatabaseOutlined />],
  ['报告中心', <BarChartOutlined />],
  ['漏洞详情', <BugOutlined />],
  ['系统设置', <SettingOutlined />],
  ['团队管理', <TeamOutlined />],
  ['授权管理', <KeyOutlined />],
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  return (
    <div className="page dashboard-page">
      <div className="metric-grid metric-grid-five">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="feature-grid">
        {featureCards.map((item) => (
          <Card key={item.title} variant="borderless" className={`feature-card tone-${item.tone}`}>
            <span className="feature-icon">{item.icon}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </div>
            <Button type="primary" onClick={() => navigate('/pentest')}>
              工作台 →
            </Button>
          </Card>
        ))}
      </div>

      <div className="dashboard-main-grid">
        <Card variant="borderless" className="summary-card">
          <SectionTitle icon={<RobotOutlined />} title="AI 今日摘要" />
          <div className="summary-item danger">
            <strong>高危风险预警</strong>
            <p>核心数据库存在高危风险，事件响应发现重大暴露面。</p>
          </div>
          <div className="summary-item warning">
            <strong>重点漏洞清单</strong>
            <p>业务区入口发现高危漏洞，支付链路存在弱口令。</p>
          </div>
          <div className="summary-item safe">
            <strong>处置建议</strong>
            <p>优先隔离访问设备，并执行凭据轮换和补丁升级。</p>
          </div>
        </Card>

        <Card variant="borderless" className="trend-card">
          <SectionTitle
            icon={<BarChartOutlined />}
            title="风险趋势"
            action={<Tag color="blue">风险趋势</Tag>}
          />
          <svg viewBox="0 0 640 260" className="trend-chart" aria-label="风险趋势折线图">
            {[50, 100, 150, 200].map((y) => (
              <line key={y} x1="36" y1={y} x2="620" y2={y} />
            ))}
            <path d="M36 224 C82 214 126 190 174 205 C226 222 274 190 310 102 C344 20 410 28 446 92 C480 154 505 238 550 238 C586 238 606 192 620 150" />
            <path className="line-purple" d="M36 218 C92 205 132 160 182 132 C230 106 270 118 310 112 C360 104 392 70 430 58 C474 44 498 82 536 88 C574 94 602 70 620 42" />
            <path className="line-green" d="M36 212 C90 194 134 166 182 142 C228 120 270 146 310 136 C356 124 394 82 430 74 C474 64 502 104 540 108 C576 112 604 82 620 52" />
            <path className="line-orange" d="M36 228 C86 214 132 180 182 164 C230 148 270 178 310 168 C358 156 394 122 432 118 C474 114 500 148 540 154 C578 160 604 130 620 102" />
            <text x="36" y="250">05-30</text>
            <text x="210" y="250">05-31</text>
            <text x="390" y="250">06-01</text>
            <text x="560" y="250">06-03</text>
          </svg>
        </Card>

        <Card variant="borderless" className="risk-card">
          <SectionTitle icon={<SafetyCertificateOutlined />} title="风险分布" />
          <div className="risk-content">
            <div className="risk-donut">
              <div>
                <span>总计发现</span>
                <strong>2,440</strong>
              </div>
            </div>
            <ul>
              <li><i className="dot severe" />严重 <strong>18</strong></li>
              <li><i className="dot high" />高危 <strong>142</strong></li>
              <li><i className="dot medium" />中危 <strong>468</strong></li>
              <li><i className="dot low" />低危 <strong>1812</strong></li>
            </ul>
          </div>
        </Card>
      </div>

      <div className="dashboard-bottom-grid">
        <Card variant="borderless">
          <SectionTitle icon={<FileTextOutlined />} title="近期任务" action={<a>查看全部</a>} />
          {tasks.slice(0, 3).map((task) => (
            <div className="recent-task" key={task.id}>
              <div><strong>{task.name}</strong><span>{task.createdAt.slice(5, 16)}</span></div>
              <Progress percent={task.progress} size="small" />
            </div>
          ))}
        </Card>
        <Card variant="borderless">
          <SectionTitle icon={<ThunderboltOutlined />} title="最新动态" />
          <div className="activity"><i className="blue" /><div><Tag color="blue">进行中</Tag><strong>电商系统渗透测试</strong><p>发现高危漏洞：SQL 注入，AI 自动研判风险分值为 8.9</p></div></div>
          <div className="activity"><i className="green" /><div><Tag color="green">已完成</Tag><strong>OA 系统日常巡检</strong><p>全量巡检任务结束，已生成安全态势分析报告</p></div></div>
          <div className="activity"><i className="orange" /><div><Tag color="orange">待处理</Tag><strong>数据库分析任务</strong><p>节点资源已就绪，等待管理员确认授权范围</p></div></div>
        </Card>
        <Card variant="borderless">
          <SectionTitle icon={<BugOutlined />} title="快捷入口" />
          <div className="quick-grid">
            {quickLinks.map(([label, icon]) => (
              <Button key={label} icon={icon}>{label}</Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
