import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { HrCatalog, LeaveRequest } from '../api/types';

/** Danh mục loại nghỉ, đối tượng, ca làm việc (ít đổi, dùng chung nhiều trang). */
export function useHrCatalog(enabled = true) {
  return useQuery({
    queryKey: ['hr', 'catalog'],
    queryFn: () => api.get<HrCatalog>('/hr/catalog'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Số đơn nghỉ chờ mình duyệt (số trên menu). */
export function useLeavePending(enabled = true) {
  return useQuery({
    queryKey: ['leave', 'pending'],
    queryFn: () => api.get<{ count: number }>('/leave/pending-count'),
    enabled,
    refetchInterval: 60_000,
  });
}

const d = (s: string) => dayjs(s).format('DD/MM/YYYY');

/** "01/03/2027 (buổi sáng)", "01/03/2027 (từ chiều) – 05/03/2027 (hết sáng)". */
export function leavePeriod(r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'startPart' | 'endPart'>) {
  if (r.startDate === r.endDate) {
    return `${d(r.startDate)}${r.startPart === 'MORNING' ? ' (buổi sáng)' : r.startPart === 'AFTERNOON' ? ' (buổi chiều)' : ''}`;
  }
  return `${d(r.startDate)}${r.startPart === 'AFTERNOON' ? ' (từ chiều)' : ''} – ${d(r.endDate)}${r.endPart === 'MORNING' ? ' (hết sáng)' : ''}`;
}

/** Số ngày kiểu Việt Nam: 1,5 */
export const fmtDays = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
