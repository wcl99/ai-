import {
  CloudUploadOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { Button, Card, Tag, Tooltip, message } from 'antd';

const fingerprint = 'YD-AI-SECURITY-PLATFORM';

export function AuthorizationPage() {
  const downloadRequest = () => {
    const blob = new Blob([JSON.stringify({ fingerprint, product: 'AI Security Platform' }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'license-request.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="page management-page material-authorization-page">
      <div className="material-page-heading">
        <div><h2>授权管理</h2><p>授权管理 - 查看系统指纹、管理授权文件及验证状态</p></div>
        <Tooltip title="授权管理功能暂未开放"><Button aria-label="刷新状态" disabled icon={<ReloadOutlined />}>刷新状态</Button></Tooltip>
      </div>
      <div className="material-authorization-summary">
        <Card variant="borderless">
          <header><span><SafetyOutlined /></span><div><h3>系统指纹</h3></div><Tag color="blue">用于申请授权</Tag></header>
          <p className="material-fingerprint-label">指纹信息 (Encoded)</p>
          <div className="material-fingerprint">
            <code>{fingerprint}</code>
            <Button type="text" icon={<CopyOutlined />} onClick={() => { void navigator.clipboard?.writeText(fingerprint); message.success('系统指纹已复制'); }} aria-label="复制系统指纹" />
          </div>
          <div className="material-fingerprint-actions"><Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard?.writeText(fingerprint); message.success('系统指纹已复制'); }}>复制指纹</Button><Button aria-label="下载 Request 文件" type="primary" icon={<DownloadOutlined />} onClick={downloadRequest}>下载 Request 文件</Button></div>
        </Card>
        <Card variant="borderless" className="material-license-status">
          <header><span><SafetyCertificateOutlined /></span><div><h3>授权状态</h3><p>当前平台许可证信息</p></div></header>
          <div className="material-license-empty"><SafetyCertificateOutlined /><strong>尚未导入授权文件</strong><p>授权功能开放后，可在下方上传许可证文件。</p><Tag color="orange">等待授权</Tag></div>
        </Card>
      </div>
      <Card className="material-license-upload" variant="borderless">
        <span className="sr-only">上传授权文件</span>
        <header><span><CloudUploadOutlined /></span><div><h3>更新授权</h3><p>上传授权文件 (license.lic)</p></div></header>
        <div className="material-upload-dropzone" aria-disabled="true"><CloudUploadOutlined /><strong>点击或拖拽文件至此处</strong><span>支持扩展名为 .lic 的系统授权文件，大小限制在 5MB 以内</span></div>
        <div className="material-license-upload-actions"><Button className="sr-only" disabled>选择授权文件</Button><Button aria-label="上传并验证" disabled type="primary" icon={<CloudUploadOutlined />}>上传并验证</Button></div>
      </Card>
      <p className="material-authorization-notice">授权管理功能暂未开放</p>
    </div>
  );
}
