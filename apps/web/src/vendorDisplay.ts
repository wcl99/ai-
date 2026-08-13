const phaseLabels: Array<[RegExp, string]> = [
  [/^(init|initiali[sz]e|queued|start|prepare|precheck)$/i, '任务编排中'],
  [/recon|information|discover|asset|subdomain|fingerprint|info_collect/i, '信息收集中'],
  [/scan|vulnerab|detect|probe/i, '漏洞探测中'],
  [/exploit|validate|verify|fuzz|penetrat/i, '验证利用中'],
  [/report|summary/i, '报告生成中'],
  [/finish|complete|done|success/i, '已完成'],
  [/fail|error/i, '执行失败'],
  [/cancel|stop/i, '已取消'],
];

export function sanitizeDisplayText(value: string) {
  return value.replace(/小易/g, '平台');
}

export function displayPhase(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return '等待阶段';
  const match = phaseLabels.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? (/[\u4e00-\u9fff]/.test(normalized) ? normalized : '任务执行中');
}
