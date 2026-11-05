import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, Descriptions, Input, Popconfirm, Result, Row, Skeleton, Space, Timeline } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeft, Ban, Check, Undo2, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { LeaveDetail } from '../../api/types';
import { Pill } from '../../components/Pill';
import { DATETIME_FORMAT, LEAVE_STATUS } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { fmtDays, leavePeriod } from '../../utils/leave';

const at = (s: string | null) => (s ? dayjs(s).format(DATETIME_FORMAT) : '');

/** Các bước xử lý đơn: gửi → chỉ huy đơn vị → lãnh đạo → kết quả. */
function Steps({ r }: { r: LeaveDetail }) {
  const items: { color: string; content: React.ReactNode }[] = [
    { color: 'blue', content: <>Gửi đơn · {at(r.createdAt)}</> },
  ];
  const rejected = r.status === 'REJECTED';
  if (r.approverUnit) {
    items.push(
      r.unitDecidedBy
        ? {
            color: rejected && !r.leaderDecidedBy ? 'red' : 'green',
            content: (
              <>
                {r.unitDecidedBy.fullName} ({r.approverUnit.name}) {rejected && !r.leaderDecidedBy ? 'không duyệt' : 'đã duyệt'} ·{' '}
                {at(r.unitDecidedAt)}
              </>
            ),
          }
        : { color: 'gray', content: <>Chỉ huy {r.approverUnit.name} duyệt</> },
    );
  }
  if (r.needsLeader || r.leaderDecidedBy) {
    items.push(
      r.leaderDecidedBy
        ? {
            color: rejected ? 'red' : 'green',
            content: (
              <>
                {r.leaderDecidedBy.fullName} (lãnh đạo) {rejected ? 'không duyệt' : 'đã duyệt'} · {at(r.leaderDecidedAt)}
              </>
            ),
          }
        : { color: 'gray', content: <>Lãnh đạo nhà trường duyệt</> },
    );
  }
  if (r.status === 'CANCELLED') items.push({ color: 'gray', content: 'Người gửi đã rút đơn' });
  if (r.revokedBy) items.push({ color: 'red', content: <>{r.revokedBy.fullName} hủy duyệt · {at(r.revokedAt)}</> });
  return <Timeline items={items} />;
}

export function LeaveDetailPage() {
  const id = Number(useParams().id);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: r, isLoading, error } = useQuery({
    queryKey: ['leave', 'detail', id],
    queryFn: () => api.get<LeaveDetail>(`/leave/${id}`),
  });
  const noteValue = (key: string) => (document.getElementById(key) as HTMLTextAreaElement | null)?.value || undefined;
  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    try {
      await fn();
      message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      await qc.invalidateQueries({ queryKey: ['leave'] });
    }
  };

  if (isLoading) return <Skeleton active style={{ padding: 24 }} />;
  if (error || !r) {
    return <Result status="404" title="Không tìm thấy đơn nghỉ" extra={<Link to="/leave">Về danh sách</Link>} />;
  }
  const p = r.permissions;

  return (
    <>
      <PageHeader
        title={`Đơn nghỉ của ${r.user.fullName}`}
        subtitle={
          <Link to="/leave" className="muted">
            <ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Nghỉ phép
          </Link>
        }
        actions={
          <Space wrap>
            {p.decide && (
              <>
                <Button
                  type="primary"
                  icon={<Check size={15} />}
                  onClick={run(() => api.post(`/leave/${id}/decide`, { decision: 'APPROVED' }), 'Đã duyệt')}
                >
                  Duyệt
                </Button>
                <Popconfirm
                  title="Không duyệt đơn này?"
                  description={<Input.TextArea id="lv-reject" placeholder="Lý do (bắt buộc)" />}
                  onConfirm={run(
                    () => api.post(`/leave/${id}/decide`, { decision: 'REJECTED', note: noteValue('lv-reject') }),
                    'Đã trả lời đơn',
                  )}
                >
                  <Button icon={<X size={15} />}>Không duyệt</Button>
                </Popconfirm>
              </>
            )}
            {p.cancel && (
              <Popconfirm title="Rút đơn nghỉ này?" onConfirm={run(() => api.post(`/leave/${id}/cancel`), 'Đã rút đơn')}>
                <Button icon={<Undo2 size={15} />}>Rút đơn</Button>
              </Popconfirm>
            )}
            {p.revoke && (
              <Popconfirm
                title="Hủy duyệt đơn này? Ngày phép được hoàn lại."
                description={<Input.TextArea id="lv-revoke" placeholder="Lý do (bắt buộc)" />}
                onConfirm={run(() => api.post(`/leave/${id}/revoke`, { note: noteValue('lv-revoke') ?? '' }), 'Đã hủy duyệt')}
              >
                <Button danger icon={<Ban size={15} />}>
                  Hủy duyệt
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />
      <div className="shell-content">
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={16}>
            <Panel title="Thông tin đơn nghỉ">
              <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
                <Descriptions.Item label="Trạng thái">
                  <Pill tone={LEAVE_STATUS[r.status]} />
                </Descriptions.Item>
                <Descriptions.Item label="Loại nghỉ">
                  {r.type.name}
                  {r.type.deductsBalance && <span className="muted"> (trừ phép năm)</span>}
                </Descriptions.Item>
                <Descriptions.Item label="Người nghỉ">
                  {r.user.fullName}
                  {r.user.position && <span className="muted"> · {r.user.position}</span>}
                </Descriptions.Item>
                <Descriptions.Item label="Đơn vị">{r.user.unit.name}</Descriptions.Item>
                <Descriptions.Item label="Thời gian">{leavePeriod(r)}</Descriptions.Item>
                <Descriptions.Item label="Số ngày làm việc">{fmtDays(r.days)}</Descriptions.Item>
                <Descriptions.Item label="Lý do" span="filled">
                  {r.reason}
                </Descriptions.Item>
                {r.decisionNote && (
                  <Descriptions.Item label="Ghi chú xử lý" span="filled">
                    {r.decisionNote}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Panel>
          </Col>
          <Col xs={24} xl={8}>
            <Panel title="Các bước duyệt">
              <Steps r={r} />
            </Panel>
          </Col>
        </Row>
      </div>
    </>
  );
}
