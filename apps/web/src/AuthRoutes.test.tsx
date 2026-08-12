import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { App } from './App';
import { getAuthGeneration } from './api/client';
import { listTasks } from './api/resources';
import { useAuth } from './auth/AuthContext';
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
  const view = render(
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
  return { ...view, queryClient };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function ReauthenticationHarness() {
  const { user: currentUser, login } = useAuth();
  return (
    <div>
      <span>{currentUser?.name ?? 'signed out'}</span>
      <button type="button" onClick={() => void login({
        username: 'admin',
        password: 'correct-password',
        captcha_token: 'captcha-token',
        captcha_answer: '7',
      })}
      >
        reauthenticate
      </button>
    </div>
  );
}

function renderReauthenticationHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReauthenticationHarness />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
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

  it('clears an expired session when a resource request returns 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient } = renderRoute('/tasks');
    queryClient.setQueryData(['assets', 'cached'], { total: 99 });

    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
    expect(queryClient.getQueryData(['assets', 'cached'])).toBeUndefined();
  });

  it('ignores a stale resource 401 after a new login succeeds', async () => {
    let resolveOldRequest!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => {
      resolveOldRequest = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(user))
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(response({
        success: true,
        token: 'not-persisted',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    const queryClient = renderReauthenticationHarness();
    await screen.findByText('Test Admin');
    const oldGeneration = getAuthGeneration();
    const oldResult = listTasks({ page: 1, pageSize: 10 });
    const oldFailure = expect(oldResult).rejects.toMatchObject({ status: 401 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await interaction.click(screen.getByRole('button', { name: 'reauthenticate' }));
    await waitFor(() => expect(getAuthGeneration()).toBe(oldGeneration + 1));
    const unauthorizedGenerations: number[] = [];
    const recordGeneration = (event: Event) => {
      unauthorizedGenerations.push((event as CustomEvent<number>).detail);
    };
    window.addEventListener('auth:unauthorized', recordGeneration);

    resolveOldRequest(response({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      details: null,
    }, 401));
    await oldFailure;
    window.removeEventListener('auth:unauthorized', recordGeneration);
    expect(unauthorizedGenerations).toEqual([]);
    expect(getAuthGeneration()).toBe(oldGeneration + 1);
    expect(queryClient.getQueryData(['auth', 'me'])).toEqual(user);

    expect(screen.getByText('Test Admin')).toBeInTheDocument();
  });

  it('shows the API message for invalid credentials', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/v1/auth/captcha') return response({
        success: true,
        message: 'ok',
        data: { question: '4 + 3 =?', token: 'captcha-token', expires_in: 120 },
      });
      if (String(input) === '/api/v1/auth/login') return response({
        success: false,
        code: 'UNAUTHORIZED',
        message: '用户名或密码错误',
        details: null,
      }, 401);
      return response({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/login');
    await screen.findByRole('heading', { name: '系统登录' });

    await interaction.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await interaction.type(screen.getByPlaceholderText('请输入密码'), 'wrong-password');
    await interaction.type(screen.getByPlaceholderText('请输入验证码'), '7');
    await interaction.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument();
  });

  it('shows the real user and logs out through the profile menu', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({ success: true, message: 'logged out', data: null }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/pentest');
    expect(await screen.findByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();

    await interaction.click(screen.getByRole('button', { name: '用户菜单' }));
    await interaction.click(await screen.findByText('退出登录'));

    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
  });

  it('restores the complete requested destination after login', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/auth/captcha') return response({
        success: true,
        message: 'ok',
        data: { question: '2 + 5 =?', token: 'captcha-token', expires_in: 120 },
      });
      if (String(input) === '/api/v1/auth/login') {
        expect(init?.method).toBe('POST');
        return response({
        success: true,
        token: 'not-persisted',
        token_type: 'bearer',
        expires_in: 3600,
        user,
        });
      }
      return response({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderRoute('/tasks?status=running#latest');
    await screen.findByRole('heading', { name: '系统登录' });

    await interaction.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await interaction.type(screen.getByPlaceholderText('请输入密码'), 'correct-password');
    await interaction.type(screen.getByPlaceholderText('请输入验证码'), '7');
    await interaction.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/tasks?status=running#latest');
    const loginCall = fetchMock.mock.calls.find(([input]) => input === '/api/v1/auth/login');
    expect(loginCall).toBeDefined();
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual(expect.objectContaining({
      captcha_token: 'captcha-token',
      captcha_answer: '7',
    }));
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
    renderRoute('/pentest');
    await screen.findByText('Test Admin');

    await interaction.click(screen.getByRole('button', { name: '用户菜单' }));
    await interaction.click(await screen.findByText('退出登录'));

    expect(await screen.findByText('退出登录失败')).toBeInTheDocument();
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
  });
});
