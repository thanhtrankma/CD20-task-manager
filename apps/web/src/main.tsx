import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ApiError } from './api/client';
import { AuthProvider, signOutLocally } from './auth/AuthContext';
import './styles/global.css';
import { theme } from './theme';

dayjs.locale('vi');

const isApiError = (err: unknown, ...status: number[]) => err instanceof ApiError && status.includes(err.status);

/** Phiên hết hạn hoặc bị thu hồi (401) ở bất kỳ request nào: đưa về trang đăng nhập. */
const onApiError = (err: unknown) => {
  if (isApiError(err, 401) && queryClient.getQueryData(['me'])) signOutLocally(queryClient);
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Lỗi quyền truy cập không thử lại: thử lại chỉ tốn request mà kết quả không đổi.
      retry: (count, err) => !isApiError(err, 401, 403, 404) && count < 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={viVN} theme={theme}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
