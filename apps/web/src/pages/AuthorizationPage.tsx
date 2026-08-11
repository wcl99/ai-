import {
  CloudUploadOutlined,
  CopyOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { Button, Card, Tag, Tooltip, message } from 'antd';

const fingerprint = 'YD-AI-SECURITY-PLATFORM';

export function AuthorizationPage() {
  return (
    <div className="page management-page material-authorization-page">
      <div className="material-page-heading">
        <div><h2>授权管理</h2><p>查看平台授权状态与设备信息。</p></div>
        <Tooltip title="授权管理功能暂未开放"><Button aria-label="刷新状态" disabled icon={<ReloadOutlined />}>刷新状态</Button></Tooltip>
      </div>
      <div className="material-authorization-summary">
        <Card variant="borderless">
          <header><span><SafetyOutlined /></span><div><h3>系统指纹</h3><p>用于绑定当前部署环境的唯一标识</p></div></header>
          <div className="material-fingerprint">
            <code>{fingerprint}</code>
            <Button type="text" icon={<CopyOutlined />} onClick={() => { void navigator.clipboard?.writeText(fingerprint); message.success('系统指纹已复制'); }} aria-label="复制系统指纹" />
          </div>
          <dl><div><dt>设备名称</dt><dd>AI 安服平台</dd></div><div><dt>部署类型</dt><dd>私有化部署</dd></div><div><dt>绑定状态</dt><dd><Tag>未绑定</Tag></dd></div></dl>
        </Card>
        <Card variant="borderless" className="material-license-status">
          <header><span><SafetyCertificateOutlined /></span><div><h3>授权状态</h3><p>当前平台许可证信息</p></div></header>
          <div className="material-license-empty"><SafetyCertificateOutlined /><strong>尚未导入授权文件</strong><p>授权功能开放后，可在下方上传许可证文件。</p><Tag color="orange">等待授权</Tag></div>
        </Card>
      </div>
      <Card className="material-license-upload" variant="borderless">
        <header><h3>上传授权文件</h3><p>支持平台签发的许可证文件</p></header>
        <div className="material-upload-dropzone" aria-disabled="true"><CloudUploadOutlined /><strong>拖拽授权文件到此处</strong><span>授权管理功能暂未开放</span><Button disabled>选择授权文件</Button></div>
      </Card>
      <p className="material-authorization-notice">授权管理功能暂未开放</p>
    </div>
  );
}
