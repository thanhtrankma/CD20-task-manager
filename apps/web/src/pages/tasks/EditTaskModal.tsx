import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Priority, TaskDetail } from '../../api/types';
import { DATE_FORMAT, PRIORITY } from '../../constants';

interface Values {
  title: string;
  description?: string;
  source?: string;
  dueDate: Dayjs;
  priority: Priority;
}

/** Người giao sửa nhiệm vụ. Đổi hạn thì người thực hiện, người theo dõi nhận thông báo. */
export function EditTaskModal({ task, open, onClose }: { task: TaskDetail; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();

  const save = useMutation({
    mutationFn: (v: Values) => {
      // Chỉ gửi trường đã đổi để dòng hoạt động ghi đúng; giữ nguyên giờ hạn cũ nếu không đổi ngày.
      const changed = <T,>(next: T, prev: T) => (next === prev ? undefined : next);
      return api.patch(`/tasks/${task.id}`, {
        title: changed(v.title, task.title),
        description: changed(v.description ?? '', task.description ?? ''),
        source: changed(v.source?.trim() ?? '', task.source ?? ''),
        priority: changed(v.priority, task.priority),
        dueDate: v.dueDate.isSame(dayjs(task.dueDate), 'day') ? undefined : v.dueDate.endOf('day').toISOString(),
      });
    },
    onSuccess: async () => {
      message.success('Đã lưu');
      onClose();
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <Modal
      open={open}
      title="Sửa nhiệm vụ"
      okText="Lưu"
      onOk={() => form.submit()}
      onCancel={onClose}
      confirmLoading={save.isPending}
      width={600}
      destroyOnHidden
    >
      <Form<Values>
        form={form}
        layout="vertical"
        initialValues={{
          title: task.title,
          description: task.description ?? undefined,
          source: task.source ?? undefined,
          dueDate: dayjs(task.dueDate),
          priority: task.priority,
        }}
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item name="title" label="Tên công việc" rules={[{ required: true, min: 3 }]}>
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name="description" label="Nội dung, yêu cầu">
          <Input.TextArea rows={4} maxLength={10000} />
        </Form.Item>
        <Form.Item name="source" label="Căn cứ giao nhiệm vụ">
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item
          name="dueDate"
          label="Hạn hoàn thành"
          rules={[{ required: true }]}
          extra="Đổi hạn: người thực hiện, người theo dõi nhận thông báo"
        >
          <DatePicker format={DATE_FORMAT} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="priority" label="Mức độ ưu tiên">
          <Select options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
