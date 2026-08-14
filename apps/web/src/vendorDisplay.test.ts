import { describe, expect, it } from 'vitest';
import { displayPhase, sanitizeDisplayText, visibleTaskError } from './vendorDisplay';

describe('display text localization', () => {
  it('removes the external vendor name from visible text', () => {
    expect(sanitizeDisplayText('小易正在编排任务')).toBe('平台正在编排任务');
    expect(sanitizeDisplayText('平台任务已创建')).toBe('平台任务已创建');
  });

  it.each([
    '报告生成失败：ZIP entry size is too large or invalid',
    '报告打包失败，请稍后重试',
    'Report generation failed: ZIP entry size is too large or invalid',
  ])('hides report generation errors from task displays: %s', (message) => {
    expect(visibleTaskError(message)).toBeNull();
  });

  it('keeps non-report task errors visible', () => {
    expect(visibleTaskError('引擎连接超时')).toBe('引擎连接超时');
  });

  it('keeps real errors when a combined message also contains a report failure', () => {
    expect(visibleTaskError(
      '报告生成失败：ZIP entry size is too large or invalid；引擎连接超时',
    )).toBe('引擎连接超时');
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
