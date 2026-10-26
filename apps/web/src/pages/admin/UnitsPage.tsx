import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Empty, Form, Input, Modal, Skeleton, Tree, TreeSelect } from 'antd';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Unit } from '../../api/types';
import { buildUnitTree } from '../../utils/units';
import { PageHeader, Panel } from '../../layouts/shell';

export function UnitsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => api.get<Unit[]>('/units'),
  });
  const tree = buildUnitTree(units);

  const create = useMutation({
    mutationFn: (v: { code: string; name: string; parentId?: number }) => api.post('/units', v),
    onSuccess: async () => {
      message.success('Đã thêm đơn vị');
      setOpen(false);
      form.resetFields();
      await qc.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Đơn vị"
        subtitle={`${units.length} đơn vị`}
        actions={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            <span className="hide-xs">Thêm đơn vị</span>
          </Button>
        }
      />
      <div className="shell-content">
        <Panel title="Cơ cấu tổ chức">
          {isLoading ? <Skeleton active /> : tree.length ? <Tree treeData={tree} defaultExpandAll showLine blockNode /> : <Empty />}
        </Panel>
      </div>
      <Modal
        open={open}
        title="Thêm đơn vị"
        okText="Lưu"
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        confirmLoading={create.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true, pattern: /^[A-Za-z0-9_-]{2,20}$/ }]}>
            <Input placeholder="VD: KCNTT" />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="Thuộc đơn vị" rules={[{ required: true }]}>
            <TreeSelect treeData={tree} treeDefaultExpandAll />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
