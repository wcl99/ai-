import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  advanceAuthGeneration,
  ApiError,
  getAuthGeneration,
} from '../api/client';
import { getCurrentUser, login as requestLogin, logout as requestLogout } from './api';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';

const authQueryKey = ['auth', 'me'] as const;

const localAuthValue: AuthContextValue = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: '22222222-2222-4222-8222-222222222222',
    username: 'local-admin',
    name: '本地管理员',
    role: 'admin',
    is_active: true,
    is_digital_human: false,
  },
  isLoading: false,
  error: null,
  login: async () => undefined,
  logout: async () => undefined,
};

export function AuthProvider({
  children,
  localBypass = false,
}: {
  children: React.ReactNode;
  localBypass?: boolean;
}) {
  if (localBypass) {
    return <AuthContext.Provider value={localAuthValue}>{children}</AuthContext.Provider>;
  }
  return <RemoteAuthProvider>{children}</RemoteAuthProvider>;
}

function RemoteAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const clearExpiredSession = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== getAuthGeneration()) return;
      queryClient.setQueryData(authQueryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    };
    window.addEventListener('auth:unauthorized', clearExpiredSession);
    return () => window.removeEventListener('auth:unauthorized', clearExpiredSession);
  }, [queryClient]);
  const session = useQuery({
    queryKey: authQueryKey,
    queryFn: async () => {
      try {
        return await getCurrentUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
  const loginMutation = useMutation({
    mutationFn: requestLogin,
    onSuccess: (user) => {
      advanceAuthGeneration();
      queryClient.setQueryData(authQueryKey, user);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: requestLogout,
    onSuccess: () => {
      advanceAuthGeneration();
      queryClient.setQueryData(authQueryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    },
  });
  const error = loginMutation.error ?? logoutMutation.error ?? session.error;
  const value: AuthContextValue = {
    user: session.data ?? null,
    isLoading: session.isPending || loginMutation.isPending || logoutMutation.isPending,
    error: error instanceof Error ? error : null,
    login: async (credentials) => {
      await loginMutation.mutateAsync(credentials);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
