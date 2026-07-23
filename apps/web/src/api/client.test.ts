import { z } from 'zod';
import { apiRequest } from './client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes same-origin credentials and validates successful JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 'validated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('/api/v1/example', z.object({ value: z.string() }));

    expect(result).toEqual({ value: 'validated' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/example',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('converts platform errors into ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: null,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ));

    const request = apiRequest('/api/v1/auth/me', z.object({ id: z.string() }));

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      }),
    );
  });

  it('rejects a successful response that violates its schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(
      apiRequest('/api/v1/example', z.object({ value: z.string() })),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it.each([
    ['an empty error response', ''],
    ['a non-JSON error response', '<html>Bad gateway</html>'],
  ])('normalizes %s', async (_description, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(body, { status: 502, headers: { 'Content-Type': 'text/html' } }),
    ));

    await expect(apiRequest('/api/v1/example', z.object({ value: z.string() }))).rejects
      .toMatchObject({ status: 502, code: 'HTTP_ERROR', message: 'Request failed (502)' });
  });
});
