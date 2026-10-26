import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';

interface AuthValue {
  me: Me | null;
  loading: boolean;
  login: (input: { username: string; password: string; otp?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Đưa giao diện về trạng thái chưa đăng nhập: đặt `me` = null (giữ nguyên query đang được theo dõi
 * để AuthProvider nhận thay đổi, RequireAuth tự chuyển về /login) rồi xóa dữ liệu của người dùng cũ.
 * Không dùng queryClient.clear(): lệnh đó tách query `me` khỏi component nên giao diện vẫn giữ người dùng cũ.
 */
export function signOutLocally(qc: QueryClient) {
  void qc.cancelQueries();
  qc.setQueryData(['me'], null);
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const value: AuthValue = {
    me: data ?? null,
    loading: isLoading,
    login: async (input) => {
      await api.post('/auth/login', input);
      await refetch();
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      signOutLocally(qc);
    },
    refresh: refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
