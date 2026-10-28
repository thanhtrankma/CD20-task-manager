import { Empty, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import type { TaskActivity, TaskDetail } from '../../api/types';
import { DATE_FORMAT, DATETIME_FORMAT } from '../../constants';

const FIELD_LABEL: Record<string, string> = {
  title: 'tên',
  description: 'nội dung',
  source: 'căn cứ',
  priority: 'mức ưu tiên',
};

const day = (iso?: string) => (iso ? dayjs(iso).format(DATE_FORMAT) : '');

function describe(a: TaskActivity): string {
  const d = a.detail ?? {};
  switch (a.type) {
    case 'CREATED':
      return 'giao nhiệm vụ';
    case 'ACKNOWLEDGED':
      return 'xác nhận đã nhận nhiệm vụ';
    case 'PROGRESS':
      return `cập nhật tiến độ ${d.progress ?? 0}%`;
    case 'SUBMITTED':
      return 'nộp báo cáo kết quả';
    case 'APPROVED':
      return 'duyệt báo cáo: Đạt';
    case 'RETURNED':
      return 'trả lại báo cáo';
    case 'UPDATED': {
      const parts = [
        ...(d.newDueDate ? [`đổi hạn ${day(d.oldDueDate)} → ${day(d.newDueDate)}`] : []),
        ...(d.fields ?? []).map((f) => `sửa ${FIELD_LABEL[f] ?? f}`),
      ];
      return parts.join(', ') || 'sửa nhiệm vụ';
    }
    case 'CANCELLED':
      return 'hủy nhiệm vụ';
    case 'NUDGED':
      return 'đôn đốc khẩn trương thực hiện';
    case 'EXTENSION_REQUESTED':
      return `đề nghị gia hạn đến ${day(d.newDueDate)}`;
    case 'EXTENSION_APPROVED':
      return `chấp thuận gia hạn đến ${day(d.newDueDate)}`;
    case 'EXTENSION_REJECTED':
      return 'không chấp thuận gia hạn';
    case 'FOLLOWED':
      return d.userIds ? `thêm ${d.userIds.length} người theo dõi` : 'theo dõi nhiệm vụ';
  }
}

const COLOR: Partial<Record<TaskActivity['type'], string>> = {
  ACKNOWLEDGED: 'green',
  APPROVED: 'green',
  EXTENSION_APPROVED: 'green',
  RETURNED: 'red',
  CANCELLED: 'red',
  NUDGED: 'red',
  EXTENSION_REQUESTED: 'orange',
  EXTENSION_REJECTED: 'orange',
  FOLLOWED: 'gray',
};

/** Dòng hoạt động: ai làm gì, lúc nào (mới nhất ở trên). Ghi chú tiến độ lấy từ lịch sử tiến độ. */
export function ActivityTimeline({ task }: { task: TaskDetail }) {
  if (!task.activities.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hoạt động" />;
  const noteOf = (a: TaskActivity) =>
    a.type === 'PROGRESS'
      ? task.updates.find(
          (u) => u.user.id === a.user.id && Math.abs(dayjs(u.createdAt).diff(a.createdAt)) < 5_000,
        )?.note
      : undefined;

  return (
    <Timeline
      items={[...task.activities].reverse().map((a) => ({
        color: COLOR[a.type] ?? 'blue',
        content: (
          <>
            <b>{a.user.fullName}</b> {describe(a)}
            <br />
            <Typography.Text type="secondary">{dayjs(a.createdAt).format(DATETIME_FORMAT)}</Typography.Text>
            {noteOf(a) && <div style={{ whiteSpace: 'pre-wrap' }}>{noteOf(a)}</div>}
          </>
        ),
      }))}
    />
  );
}
