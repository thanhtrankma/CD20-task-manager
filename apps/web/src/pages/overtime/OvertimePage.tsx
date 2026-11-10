import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, Modal, Pagination, Popconfirm, Space, Table, Tabs, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Clock4 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { OvertimeRequest, Paged } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Pill } from '../../components/Pill';
import { DATE_FORMAT, DATETIME_FORMAT, fmtMinutes, OVERTIME_STATUS, WEEKDAY } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { useHrCatalog } from '../../utils/leave';

type Scope = 'mine' | 'approve' | 'unit';

const minutes = (r: Pick<OvertimeRequest, 'startTime' | 'endTime'>) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return m(r.endTime) - m(r.startTime);
};

/** Số đăng ký làm thêm chờ mình duyệt (số trên menu). */
export function useOvertimePending(enabled = true) {
  return useQuery({
    queryKey: ['overtime', 'pending'],
    queryFn: () => api.get<{ count: number }>('/overtime/pending-count'),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Đăng ký làm thêm giờ (ca 3, sau giờ ra ca 2); chỉ huy đơn vị duyệt; chỉ giờ đã duyệt mới được tính công. */
export function OvertimePage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const canApprove = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  const seesUnit = canApprove || !!me?.hrManager;
  const pending = useOvertimePending(canApprove);
  const p = params.get('scope') as Scope | null;
  const scope: Scope = p === 'approve' && canApprove ? 'approve' : p === 'unit' && seesUnit ? 'unit' : 'mine';
  const n = pending.data?.count;

  return (
    <>
      <PageHeader
        title="Làm thêm giờ"
        subtitle="Đăng ký trước để giờ làm thêm (ca 3) được tính công"
        actions={
          <Button type="primary" icon={<Clock4 size={16} />} onClick={() => setCreating(true)}>
            <span className="hide-xs">Đăng ký làm thêm</span>
          </Button>
        }
      />
      <div className="shell-content">
        <Panel flush>
          <Tabs
            activeKey={scope}
            onChange={(k) => setParams(k === 'mine' ? {} : { scope: k })}
            tabBarStyle={{ padding: '0 20px', marginBottom: 0 }}
            items={[
              { key: 'mine', label: 'Đăng ký của tôi' },
              ...(canApprove ? [{ key: 'approve', label: `Chờ tôi duyệt${n ? ` (${n})` : ''}` }] : []),
              ...(seesUnit ? [{ key: 'unit', label: me?.role === 'LEADER' || me?.hrManager ? 'Toàn trường' : 'Đơn vị' }] : []),
            ]}
          />
          <OvertimeList key={scope} scope={scope} />
        </Panel>
      </div>
      <OvertimeModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function OvertimeList({ scope }: { scope: Scope }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['overtime', 'list', scope, page],
    queryFn: () => api.get<Paged<OvertimeRequest>>(`/overtime${toQuery({ scope, page, pageSize: scope === 'approve' ? 200 : 20 })}`),
  });
  const noteValue = (id: string) => (document.getElementById(id) as HTMLTextAreaElement | null)?.value || undefined;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      setSelected([]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['overtime'] });
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    }
  };

  return (
    <>
      {scope === 'approve' && (
        <div className="filter-bar">
          <Button
            type="primary"
            disabled={!selected.length || busy}
            onClick={() =>
              act(async () => {
                const r = await api.post<{ failed: { message: string }[] }>('/overtime/approve-batch', { ids: selected });
                if (r.failed.length) message.warning(`${r.failed.length} đăng ký chưa duyệt được: ${r.failed[0].message}`);
              }, 'Đã duyệt các đăng ký đã chọn')
            }
          >
            Duyệt {selected.length ? `(${selected.length})` : ''}
          </Button>
          <span className="muted">Không duyệt thì làm từng đăng ký kèm lý do.</span>
        </div>
      )}
      <Table<OvertimeRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={false}
        scroll={{ x: 900 }}
        rowSelection={scope === 'approve' ? { selectedRowKeys: selected, onChange: (k) => setSelected(k as number[]) } : undefined}
        locale={{ emptyText: scope === 'approve' ? 'Không có đăng ký nào chờ đồng chí duyệt' : 'Chưa có đăng ký làm thêm nào' }}
        columns={[
          ...(scope !== 'mine'
            ? [
                {
                  title: 'Người làm thêm',
                  render: (_: unknown, r: OvertimeRequest) => (
                    <>
                      <div style={{ fontWeight: 600 }}>{r.user.fullName}</div>
                      <div className="muted">{r.user.unit.name}</div>
                    </>
                  ),
                },
              ]
            : []),
          {
            title: 'Ngày',
            width: 130,
            render: (_, r) => `${WEEKDAY[dayjs(r.date).day() || 7]}, ${dayjs(r.date).format(DATE_FORMAT)}`,
          },
          {
            title: 'Giờ',
            width: 170,
            render: (_, r) => (
              <>
                {r.startTime}–{r.endTime}
                <div className="muted">{fmtMinutes(minutes(r))}</div>
              </>
            ),
          },
          {
            title: 'Nội dung',
            render: (_, r) => (
              <>
                {r.reason}
                {r.decisionNote && <div className="muted">Ghi chú: {r.decisionNote}</div>}
              </>
            ),
          },
          {
            title: 'Trạng thái',
            width: 170,
            render: (_, r) => (
              <>
                <Pill tone={OVERTIME_STATUS[r.status]} />
                {r.decidedBy && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.decidedBy.fullName} · {dayjs(r.decidedAt).format(DATETIME_FORMAT)}
                  </div>
                )}
              </>
            ),
          },
          {
            title: '',
            width: 190,
            render: (_, r) => (
              <Space size={6} wrap>
                {r.permissions.decide && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      disabled={busy}
                      onClick={() => act(() => api.post(`/overtime/${r.id}/decide`, { decision: 'APPROVED' }), 'Đã duyệt')}
                    >
                      Duyệt
                    </Button>
                    <Popconfirm
                      title="Không duyệt đăng ký này?"
                      description={<Input.TextArea id={`ot-${r.id}`} placeholder="Lý do (bắt buộc)" />}
                      onConfirm={() =>
                        act(
                          () => api.post(`/overtime/${r.id}/decide`, { decision: 'REJECTED', note: noteValue(`ot-${r.id}`) }),
                          'Đã trả lời đăng ký',
                        )
                      }
                    >
                      <Button size="small" disabled={busy}>
                        Không duyệt
                      </Button>
                    </Popconfirm>
                  </>
                )}
                {r.permissions.cancel && (
                  <Popconfirm title="Rút đăng ký làm thêm này?" onConfirm={() => act(() => api.post(`/overtime/${r.id}/cancel`), 'Đã rút')}>
                    <Button size="small" disabled={busy}>
                      Rút
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      {scope !== 'approve' && (data?.total ?? 0) > 20 && (
        <div className="filter-bar" style={{ justifyContent: 'flex-end', borderBottom: 0 }}>
          <Pagination current={page} pageSize={20} total={data?.total} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </>
  );
}

function OvertimeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<{ date: Dayjs; end: Dayjs; reason: string }>();
  const catalog = useHrCatalog(open);
  const shift = catalog.data?.shifts.find((s) => s.isDefault);
  const send = useMutation({
    mutationFn: (v: { date: Dayjs; end: Dayjs; reason: string }) =>
      api.post('/overtime', { date: v.date.format('YYYY-MM-DD'), endTime: v.end.format('HH:mm'), reason: v.reason }),
    onSuccess: async () => {
      message.success('Đã gửi đăng ký làm thêm');
      onClose();
      await qc.invalidateQueries({ queryKey: ['overtime'] });
    },
    onError: (e) => message.error(e.message),
  });
  return (
    <Modal open={open} title="Đăng ký làm thêm giờ" okText="Gửi đăng ký" onOk={() => form.submit()} onCancel={onClose} confirmLoading={send.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => send.mutate(v)}>
        <p className="muted">
          Làm thêm (ca 3) bắt đầu từ giờ ra ca 2{shift ? ` (${shift.endTime})` : ''}. Phải chấm công vào, ra ca 3 riêng; chỉ
          tính phần trong giờ đã duyệt, từ {shift?.overtimeMinMinutes ?? 30} phút trở lên.
        </p>
        <Form.Item name="date" label="Ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
          <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="end" label="Làm đến" rules={[{ required: true, message: 'Chọn giờ kết thúc' }]}>
          <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="reason" label="Nội dung công việc" rules={[{ required: true, min: 3, message: 'Nhập nội dung' }]}>
          <Input.TextArea rows={3} maxLength={2000} placeholder="Ví dụ: coi thi, chấm thi, trực phòng máy…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
