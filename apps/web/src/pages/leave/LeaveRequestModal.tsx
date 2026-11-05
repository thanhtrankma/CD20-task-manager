import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, DatePicker, Form, Input, Modal, Radio, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { DayPart, LeaveDetail } from '../../api/types';
import { DATE_FORMAT } from '../../constants';
import { fmtDays, useHrCatalog } from '../../utils/leave';

interface Values {
  typeId: number;
  startDate: Dayjs;
  endDate: Dayjs;
  startPart: DayPart;
  endPart: DayPart;
  reason: string;
}

const body = (v: Partial<Values>) =>
  v.typeId && v.startDate && v.endDate
    ? {
        typeId: v.typeId,
        startDate: v.startDate.format('YYYY-MM-DD'),
        endDate: v.endDate.format('YYYY-MM-DD'),
        startPart: v.startPart ?? 'FULL',
        endPart: v.endPart ?? 'FULL',
      }
    : null;

/** Đăng ký nghỉ: loại nghỉ, khoảng ngày, buổi; tính ngay số ngày và phép năm còn lại. */
export function LeaveRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  const catalog = useHrCatalog(open);
  const values = Form.useWatch([], form) as Partial<Values> | undefined;
  const span = body(values ?? {});
  const sameDay = !!values?.startDate && !!values?.endDate && values.startDate.isSame(values.endDate, 'day');

  const preview = useQuery({
    queryKey: ['leave', 'preview', span],
    queryFn: () =>
      api.post<{ days: number; deductsBalance: boolean; remaining: number | null }>('/leave/preview', span),
    enabled: open && !!span && !values!.endDate!.isBefore(values!.startDate!, 'day'),
    retry: false,
  });

  const send = useMutation({
    mutationFn: (v: Values) => api.post<LeaveDetail>('/leave', { ...body(v), reason: v.reason }),
    onSuccess: async (r) => {
      message.success('Đã gửi đơn nghỉ');
      onClose();
      await qc.invalidateQueries({ queryKey: ['leave'] });
      navigate(`/leave/${r.id}`);
    },
    onError: (e) => message.error(e.message),
  });

  const types = (catalog.data?.leaveTypes ?? []).filter((t) => t.isActive);
  const p = preview.data;

  return (
    <Modal
      open={open}
      title="Đăng ký nghỉ"
      okText="Gửi đơn"
      onOk={() => form.submit()}
      onCancel={onClose}
      confirmLoading={send.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ startPart: 'FULL', endPart: 'FULL' }}
        onFinish={(v) => send.mutate(v)}
        onValuesChange={(changed: Partial<Values>) => {
          // Chọn ngày bắt đầu sau ngày kết thúc thì kéo ngày kết thúc theo.
          const end = form.getFieldValue('endDate') as Dayjs | undefined;
          if (changed.startDate && (!end || end.isBefore(changed.startDate, 'day'))) form.setFieldValue('endDate', changed.startDate);
        }}
      >
        <Form.Item name="typeId" label="Loại nghỉ" rules={[{ required: true, message: 'Chọn loại nghỉ' }]}>
          <Select
            placeholder="Chọn loại nghỉ"
            options={types.map((t) => ({ value: t.id, label: t.deductsBalance ? `${t.name} (trừ phép năm)` : t.name }))}
          />
        </Form.Item>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
            <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endDate" label="Đến ngày" rules={[{ required: true, message: 'Chọn ngày kết thúc' }]}>
            <DatePicker
              format={DATE_FORMAT}
              style={{ width: '100%' }}
              disabledDate={(d) => !!values?.startDate && d.isBefore(values.startDate, 'day')}
            />
          </Form.Item>
        </div>
        {sameDay ? (
          <Form.Item name="startPart" label="Buổi">
            <Radio.Group
              optionType="button"
              options={[
                { value: 'FULL', label: 'Cả ngày' },
                { value: 'MORNING', label: 'Buổi sáng' },
                { value: 'AFTERNOON', label: 'Buổi chiều' },
              ]}
            />
          </Form.Item>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Form.Item name="startPart" label="Ngày đầu">
              <Radio.Group
                optionType="button"
                options={[
                  { value: 'FULL', label: 'Cả ngày' },
                  { value: 'AFTERNOON', label: 'Từ buổi chiều' },
                ]}
              />
            </Form.Item>
            <Form.Item name="endPart" label="Ngày cuối">
              <Radio.Group
                optionType="button"
                options={[
                  { value: 'FULL', label: 'Cả ngày' },
                  { value: 'MORNING', label: 'Đến hết buổi sáng' },
                ]}
              />
            </Form.Item>
          </div>
        )}
        {span && (preview.error || p) && (
          <Alert
            style={{ marginBottom: 16 }}
            type={preview.error || (p?.remaining != null && p.remaining < p.days) ? 'warning' : 'info'}
            showIcon
            title={
              preview.error
                ? preview.error.message
                : `Tính ${fmtDays(p!.days)} ngày làm việc (đã bỏ ngày nghỉ hằng tuần, ngày lễ)` +
                  (p!.remaining != null
                    ? `. Phép năm ${values!.startDate!.year()} còn ${fmtDays(p!.remaining)} ngày` +
                      (p!.remaining < p!.days ? ', không đủ' : '')
                    : '')
            }
          />
        )}
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, min: 3, message: 'Nhập lý do nghỉ' }]}>
          <Input.TextArea rows={3} maxLength={2000} placeholder="Ví dụ: việc gia đình, khám bệnh…" />
        </Form.Item>
        <div className="muted">
          Chỉ huy đơn vị duyệt; nghỉ quá {catalog.data?.settings.leaveEscalateDays ?? 3} ngày thì chuyển tiếp lãnh đạo nhà
          trường duyệt.
        </div>
      </Form>
    </Modal>
  );
}
