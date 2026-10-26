import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select, TreeSelect } from 'antd';
import type { Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Priority, Unit, UserRow } from '../../api/types';
import { DATE_FORMAT, PRIORITY } from '../../constants';
import { buildUnitTree } from '../../utils/units';

interface Values {
  title: string;
  description?: string;
  dueDate: Dayjs;
  priority: Priority;
  leadUnits?: number[];
  leadUsers?: number[];
  supportUsers?: number[];
}

export function CreateTaskModal({
  open,
  onClose,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  parentId?: number;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units'), enabled: open });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users'), enabled: open });
  const userOptions = (users.data ?? [])
    .filter((u) => u.isActive && u.role !== 'ADMIN')
    .map((u) => ({ value: u.id, label: `${u.fullName} (${u.unit.name})` }));

  const create = useMutation({
    mutationFn: (v: Values) =>
      api.post('/tasks', {
        title: v.title,
        description: v.description,
        dueDate: v.dueDate.endOf('day').toISOString(),
        priority: v.priority,
        parentId,
        assignees: [
          ...(v.leadUnits ?? []).map((unitId) => ({ unitId, role: 'LEAD' })),
          ...(v.leadUsers ?? []).map((userId) => ({ userId, role: 'LEAD' })),
          ...(v.supportUsers ?? []).map((userId) => ({ userId, role: 'SUPPORT' })),
        ],
      }),
    onSuccess: async () => {
      message.success('Đã giao việc');
      form.resetFields();
      onClose();
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <Modal
      open={open}
      title={parentId ? 'Chia việc con' : 'Giao việc mới'}
      okText="Giao việc"
      onOk={() => form.submit()}
      onCancel={onClose}
      confirmLoading={create.isPending}
      width={640}
      destroyOnHidden
    >
      <Form<Values>
        form={form}
        layout="vertical"
        initialValues={{ priority: 'NORMAL' }}
        onFinish={(v) => {
          if (!v.leadUnits?.length && !v.leadUsers?.length) {
            message.warning('Chọn ít nhất một đơn vị hoặc cá nhân chủ trì');
            return;
          }
          create.mutate(v);
        }}
      >
        <Form.Item name="title" label="Tên công việc" rules={[{ required: true, min: 3 }]}>
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name="description" label="Nội dung, yêu cầu">
          <Input.TextArea rows={4} maxLength={10000} />
        </Form.Item>
        <Form.Item name="dueDate" label="Hạn hoàn thành" rules={[{ required: true }]}>
          <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="priority" label="Mức độ ưu tiên">
          <Select options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} />
        </Form.Item>
        <Form.Item name="leadUnits" label="Đơn vị chủ trì">
          <TreeSelect
            treeData={buildUnitTree(units.data ?? [])}
            multiple
            treeDefaultExpandAll
            allowClear
            placeholder="Chọn đơn vị"
          />
        </Form.Item>
        <Form.Item name="leadUsers" label="Cá nhân chủ trì">
          <Select mode="multiple" options={userOptions} optionFilterProp="label" allowClear />
        </Form.Item>
        <Form.Item name="supportUsers" label="Người phối hợp">
          <Select mode="multiple" options={userOptions} optionFilterProp="label" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
