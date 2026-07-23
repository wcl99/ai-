import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { getCurrentUser, login as requestLogin, logout as requestLogout } from './api';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';

const authQueryKey = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
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
    onSuccess: (user) => queryClient.setQueryData(authQueryKey, user),
  });
  const logoutMutation = useMutation({
    mutationFn: requestLogout,
    onSuccess: () => {
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
