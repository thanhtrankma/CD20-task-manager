import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Form, Input, Modal, Select, TreeSelect, Upload } from 'antd';
import type { UploadFile } from 'antd';
import type { Dayjs } from 'dayjs';
import { Upload as UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Priority, Unit, UserRow } from '../../api/types';
import { DATE_FORMAT, PRIORITY } from '../../constants';
import { buildUnitTree } from '../../utils/units';

interface Values {
  title: string;
  description?: string;
  source?: string;
  dueDate: Dayjs;
  priority: Priority;
  leadUnits?: number[];
  leadUsers?: number[];
  supportUsers?: number[];
  followers?: number[];
}

/** Loại tệp cho phép (khớp danh sách kiểm tra ở máy chủ). */
export const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.pptx,.png,.jpg,.jpeg';

/** Danh sách cán bộ để chọn người nhận, người theo dõi (máy chủ đã giới hạn theo phạm vi được giao việc). */
export function useUserOptions(enabled: boolean) {
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users'), enabled });
  return (users.data ?? [])
    .filter((u) => u.isActive && u.role !== 'ADMIN')
    .map((u) => ({ value: u.id, label: `${u.fullName} (${u.unit.name})` }));
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
  const [files, setFiles] = useState<UploadFile[]>([]);
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units'), enabled: open });
  const userOptions = useUserOptions(open);

  const create = useMutation({
    mutationFn: async (v: Values) => {
      const task = await api.post<{ id: number }>('/tasks', {
        title: v.title,
        description: v.description,
        source: v.source?.trim() || undefined,
        dueDate: v.dueDate.endOf('day').toISOString(),
        priority: v.priority,
        parentId,
        assignees: [
          ...(v.leadUnits ?? []).map((unitId) => ({ unitId, role: 'LEAD' })),
          ...(v.leadUsers ?? []).map((userId) => ({ userId, role: 'LEAD' })),
          ...(v.supportUsers ?? []).map((userId) => ({ userId, role: 'SUPPORT' })),
        ],
        followerIds: v.followers,
      });
      // Tệp kèm (văn bản chỉ đạo, biểu mẫu) tải lên sau khi đã có nhiệm vụ.
      const failed: string[] = [];
      for (const f of files) {
        const body = new FormData();
        body.append('file', f.originFileObj as File, f.name);
        await api.post(`/files?taskId=${task.id}`, body).catch(() => failed.push(f.name));
      }
      return failed;
    },
    onSuccess: async (failed) => {
      if (failed.length) message.warning(`Đã giao việc, nhưng không tải lên được: ${failed.join(', ')}`);
      else message.success('Đã giao việc');
      form.resetFields();
      setFiles([]);
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
        <Form.Item
          name="source"
          label="Căn cứ giao nhiệm vụ"
          extra="Số, ký hiệu, ngày văn bản hoặc kết luận giao ban. Không ghi nội dung mật."
        >
          <Input maxLength={500} placeholder="Vd: Kết luận giao ban tuần 43; Kế hoạch số 30/KH-CĐN20" />
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
        <Form.Item name="followers" label="Người theo dõi" extra="Nắm tình hình, nhận thông báo; không phải thực hiện">
          <Select mode="multiple" options={userOptions} optionFilterProp="label" allowClear />
        </Form.Item>
        <Form.Item label="Tệp đính kèm" extra="Văn bản chỉ đạo, biểu mẫu (PDF, Word, Excel, ảnh)">
          <Upload
            fileList={files}
            beforeUpload={() => false}
            onChange={({ fileList }) => setFiles(fileList)}
            accept={FILE_ACCEPT}
            multiple
          >
            <Button icon={<UploadIcon size={15} />}>Chọn tệp</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}
