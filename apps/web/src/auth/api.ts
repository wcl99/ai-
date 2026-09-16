import { apiRequest } from '../api/client';
import {
  captchaChallengeSchema,
  emptyEnvelopeSchema,
  loginResponseSchema,
  userSchema,
} from '../api/schemas';

export interface LoginCredentials {
  username: string;
  password: string;
  captcha_token: string;
  captcha_answer: string;
}

export async function getCaptcha() {
  const response = await apiRequest('/api/v1/auth/captcha', captchaChallengeSchema);
  return response.data;
}

export function getCurrentUser() {
  return apiRequest('/api/v1/auth/me', userSchema);
}

export async function login(credentials: LoginCredentials) {
  const response = await apiRequest('/api/v1/auth/login', loginResponseSchema, {
    method: 'POST',
    body: credentials,
  });
  return response.user;
}

export function logout() {
  return apiRequest('/api/v1/auth/logout', emptyEnvelopeSchema, { method: 'POST' });
}
