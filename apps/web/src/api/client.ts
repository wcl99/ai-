import { z } from 'zod';
import { sanitizeDisplayText } from '../vendorDisplay';

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

let authGeneration = 0;

export function getAuthGeneration() {
  return authGeneration;
}

export function advanceAuthGeneration() {
  authGeneration += 1;
}

function responseError(response: Response, body: string, requestAuthGeneration: number) {
  if (
    response.status === 401
    && requestAuthGeneration === getAuthGeneration()
    && typeof window !== 'undefined'
  ) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized', {
      detail: requestAuthGeneration,
    }));
  }
  try {
    const parsed: unknown = body ? JSON.parse(body) : undefined;
    const error = platformErrorSchema.safeParse(parsed);
    if (error.success) {
      return new ApiError(
        response.status,
        error.data.code,
        sanitizeDisplayText(error.data.message),
        error.data.details,
      );
    }
  } catch {
    // Non-JSON proxy and gateway responses use the stable fallback below.
  }
  return new ApiError(response.status, 'HTTP_ERROR', `Request failed (${response.status})`);
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const requestAuthGeneration = getAuthGeneration();
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
  if (!response.ok) {
    throw responseError(response, responseBody, requestAuthGeneration);
  }
  const payload: unknown = responseBody ? JSON.parse(responseBody) : undefined;
  return schema.parse(payload);
}

export async function apiTextRequest(
  path: string,
  options: Omit<RequestInit, 'body'> = {},
) {
  const requestAuthGeneration = getAuthGeneration();
  const response = await fetch(path, { ...options, credentials: 'include' });
  const body = await response.text();
  if (!response.ok) throw responseError(response, body, requestAuthGeneration);
  return body;
}
