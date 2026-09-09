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

export function visibleTaskError(value?: string | null) {
  if (!value) return null;
  const reportFailure = /报告(?:生成|打包)(?:过程)?失败|report (?:generation|packaging)(?: has)? failed|zip entry size is too large or invalid/i;
  const parts = value.split(/[；;\r\n]+/).map((part) => part.trim()).filter(Boolean);
  const visible = parts.filter((part) => !reportFailure.test(part));
  if (visible.length === parts.length) return value;
  return visible.length ? visible.join('；') : null;
}

export function displayPhase(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return '等待阶段';
  const match = phaseLabels.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? (/[\u4e00-\u9fff]/.test(normalized) ? normalized : '任务执行中');
}
