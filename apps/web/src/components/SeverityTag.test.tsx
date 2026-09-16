import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeverityTag } from './Ui';

describe('SeverityTag', () => {
  it.each([
    ['严重', 'ant-tag-red'],
    ['高危', 'ant-tag-orange'],
    ['中危', 'ant-tag-blue'],
    ['低危', 'ant-tag-green'],
  ])('uses the global color for %s', (severity, className) => {
    render(<SeverityTag severity={severity} />);

    expect(screen.getByText(severity)).toHaveClass(className);
  });

  it('normalizes API severity codes before rendering', () => {
    render(<SeverityTag severity="low" />);

    expect(screen.getByText('低危')).toHaveClass('ant-tag-green');
  });
});
