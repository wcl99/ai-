import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage, SettingsPage } from './ManagementPages';

describe('management pages', () => {
  it('adds an authorized asset', async () => {
    const user = userEvent.setup();
    render(<AssetsPage />);

    await user.click(screen.getByRole('button', { name: /新增资产/ }));
    await user.type(screen.getByPlaceholderText(/admin.example.com/), 'new.example.com');
    await user.type(screen.getByPlaceholderText('例如电商业务线'), '验证业务线');
    await user.click(screen.getByRole('button', { name: '确认添加' }));

    expect(await screen.findByText('new.example.com')).toBeInTheDocument();
  });

  it('shows validation integration settings', () => {
    render(<SettingsPage />);
    expect(screen.getByText('小易渗透引擎')).toBeInTheDocument();
    expect(screen.getByText('智能数字人')).toBeInTheDocument();
  });
});
