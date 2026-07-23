import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: '22222222-2222-4222-8222-222222222222',
  username: 'admin',
  name: 'Test Admin',
  role: 'admin',
  is_active: true,
  is_digital_human: false,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

describe('authenticated routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redirects an unauthenticated business route to login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      details: null,
    }, 401)));

    renderRoute('/tasks');

    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
  });

  it('shows the API message for invalid credentials', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401))
      .mockResolvedValueOnce(response({
        success: false,
        code: 'UNAUTHORIZED',
        message: '用户名或密码错误',
        details: null,
      }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/login');
    await screen.findByRole('heading', { name: '系统登录' });

    await interaction.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await interaction.type(screen.getByPlaceholderText('请输入密码'), 'wrong-password');
    await interaction.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument();
  });

  it('shows the real user and logs out through the profile menu', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({ success: true, message: 'logged out', data: null }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/overview');
    expect(await screen.findByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();

    await interaction.click(screen.getByRole('button', { name: '用户菜单' }));
    await interaction.click(await screen.findByText('退出登录'));

    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
  });

  it('restores the complete requested destination after login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401))
      .mockResolvedValueOnce(response({
        success: true,
        token: 'not-persisted',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/tasks?status=running#latest');
    await screen.findByRole('heading', { name: '系统登录' });

    await interaction.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await interaction.type(screen.getByPlaceholderText('请输入密码'), 'correct-password');
    await interaction.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/tasks?status=running#latest');
  });

  it('keeps the session and shows an error when logout fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: '退出登录失败',
        details: null,
      }, 503));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/overview');
    await screen.findByText('Test Admin');

    await interaction.click(screen.getByRole('button', { name: '用户菜单' }));
    await interaction.click(await screen.findByText('退出登录'));

    expect(await screen.findByText('退出登录失败')).toBeInTheDocument();
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
  });
});
