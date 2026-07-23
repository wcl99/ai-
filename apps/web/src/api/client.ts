import { z } from 'zod';

const platformErrorSchema = z.object({
  success: z.literal(false),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    headers,
  });
  const responseBody = await response.text();
  let payload: unknown;
  try {
    payload = responseBody ? JSON.parse(responseBody) : undefined;
  } catch (error) {
    if (!response.ok) {
      throw new ApiError(response.status, 'HTTP_ERROR', `Request failed (${response.status})`);
    }
    throw error;
  }
  if (!response.ok) {
    const error = platformErrorSchema.safeParse(payload);
    if (error.success) {
      throw new ApiError(
        response.status,
        error.data.code,
        error.data.message,
        error.data.details,
      );
    }
    throw new ApiError(response.status, 'HTTP_ERROR', `Request failed (${response.status})`);
  }
  return schema.parse(payload);
}
