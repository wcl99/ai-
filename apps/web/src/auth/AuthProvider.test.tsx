import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from './AuthContext';
import { AuthProvider } from './AuthProvider';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: '22222222-2222-4222-8222-222222222222',
  username: 'admin',
  name: 'Test Admin',
  role: 'admin',
  is_active: true,
  is_digital_human: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function Harness() {
  const auth = useAuth();
  if (auth.isLoading) return <span>loading</span>;
  return (
    <div>
      <span>{auth.user?.name ?? 'signed-out'}</span>
      <span>{auth.error?.message ?? 'no-error'}</span>
      <button type="button" onClick={() => void auth.login({ username: 'admin', password: 'password123' })}>login</button>
      <button type="button" onClick={() => void auth.logout()}>logout</button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><Harness /></AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AuthProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores the current user from the session cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(user)));

    renderProvider();

    expect(await screen.findByText('Test Admin')).toBeInTheDocument();
  });

  it('treats a 401 session response as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      details: null,
    }, 401)));

    renderProvider();

    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(screen.getByText('no-error')).toBeInTheDocument();
  });

  it('updates auth state after login and logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
      }, 401))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        token: 'response-token-is-not-persisted',
        token_type: 'Bearer',
        expires_in: 3600,
        user,
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'logged out', data: null }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderProvider();
    await screen.findByText('signed-out');

    await interaction.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('Test Admin')).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: 'logout' }));

    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
