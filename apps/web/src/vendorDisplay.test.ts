import { describe, expect, it } from 'vitest';
import { displayPhase, sanitizeDisplayText } from './vendorDisplay';

describe('display text localization', () => {
  it('removes the external vendor name from visible text', () => {
    expect(sanitizeDisplayText('小易正在编排任务')).toBe('平台正在编排任务');
    expect(sanitizeDisplayText('平台任务已创建')).toBe('平台任务已创建');
  });

  it.each([
    ['INIT', '任务编排中'],
    ['SCANNING', '漏洞探测中'],
    ['EXPLOITING', '验证利用中'],
    ['FINISHED', '已完成'],
  ])('localizes phase %s', (phase, label) => {
    expect(displayPhase(phase)).toBe(label);
  });
});
