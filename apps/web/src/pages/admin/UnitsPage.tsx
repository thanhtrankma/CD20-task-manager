import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Empty, Form, Input, Modal, Popconfirm, Skeleton, Space, Tree, TreeSelect } from 'antd';
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Unit, UserRow } from '../../api/types';
import { Pill } from '../../components/Pill';
import { buildUnitTree, type UnitNode } from '../../utils/units';
import { PageHeader, Panel } from '../../layouts/shell';

type Editing = { mode: 'create' } | { mode: 'edit'; unit: Unit };

export function UnitsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [form] = Form.useForm();
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => api.get<Unit[]>('/units'),
  });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const byId = new Map(units.map((u) => [u.id, u]));
  const staffCount = (id: number) => (users.data ?? []).filter((u) => u.unitId === id && u.isActive).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ['units'] });

  const save = useMutation({
    mutationFn: (v: { code?: string; name: string; parentId?: number }) =>
      editing?.mode === 'edit'
        ? api.patch(`/units/${editing.unit.id}`, {
            name: v.name,
            // Đơn vị gốc không có đơn vị cha.
            parentId: editing.unit.parentId === null || v.parentId === editing.unit.parentId ? undefined : v.parentId,
          })
        : api.post('/units', v),
    onSuccess: async () => {
      message.success(editing?.mode === 'edit' ? 'Đã lưu đơn vị' : 'Đã thêm đơn vị');
      setEditing(null);
      form.resetFields();
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });

  const setActive = async (unit: Unit, isActive: boolean) => {
    try {
      await api.patch(`/units/${unit.id}`, { isActive });
      message.success(isActive ? 'Đã hiện lại đơn vị' : 'Đã ẩn đơn vị');
      await refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const open = (e: Editing) => {
    setEditing(e);
    form.setFieldsValue(e.mode === 'edit' ? { name: e.unit.name, parentId: e.unit.parentId ?? undefined } : {});
  };

  const renderNode = (node: UnitNode) => {
    const unit = byId.get(node.value)!;
    const n = staffCount(unit.id);
    return (
      <span className="unit-node">
        <span style={{ opacity: unit.isActive ? 1 : 0.5 }}>
          {unit.name} <span className="muted">· {unit.code}{n ? ` · ${n} cán bộ` : ''}</span>
        </span>
        {!unit.isActive && <Pill tone={{ label: 'Đã ẩn', bg: '#f1f5f9', fg: '#64748b' }} />}
        <Space size={2} className="unit-actions">
          <Button size="small" type="text" icon={<Pencil size={14} />} onClick={() => open({ mode: 'edit', unit })} title="Sửa" />
          {unit.parentId !== null &&
            (unit.isActive ? (
              <Popconfirm
                title={`Ẩn đơn vị ${unit.name}?`}
                description="Đơn vị ẩn không chọn được khi giao việc, tạo tài khoản. Dữ liệu cũ vẫn giữ."
                onConfirm={() => setActive(unit, false)}
              >
                <Button size="small" type="text" icon={<EyeOff size={14} />} title="Ẩn" />
              </Popconfirm>
            ) : (
              <Button size="small" type="text" icon={<Eye size={14} />} title="Hiện lại" onClick={() => setActive(unit, true)} />
            ))}
        </Space>
      </span>
    );
  };

  const tree = buildUnitTree(units, { includeInactive: showHidden });
  const hidden = units.filter((u) => !u.isActive).length;
  // Không cho chọn chính đơn vị đang sửa làm đơn vị cha (máy chủ cũng chặn chọn đơn vị con của nó).
  const parentTree = buildUnitTree(editing?.mode === 'edit' ? units.filter((u) => u.id !== editing.unit.id) : units);

  return (
    <>
      <PageHeader
        title="Đơn vị"
        subtitle={`${units.length - hidden} đơn vị đang hoạt động${hidden ? `, ${hidden} đã ẩn` : ''}`}
        actions={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => open({ mode: 'create' })}>
            <span className="hide-xs">Thêm đơn vị</span>
          </Button>
        }
      />
      <div className="shell-content">
        <Panel
          title="Cơ cấu tổ chức"
          extra={
            hidden > 0 && (
              <Checkbox checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)}>
                Hiện đơn vị đã ẩn
              </Checkbox>
            )
          }
        >
          {isLoading ? (
            <Skeleton active />
          ) : tree.length ? (
            <Tree treeData={tree} defaultExpandAll showLine blockNode selectable={false} titleRender={renderNode} />
          ) : (
            <Empty />
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            Muốn ẩn một đơn vị: chuyển hết cán bộ sang đơn vị khác (trang Tài khoản → Sửa) và ẩn các đơn vị trực thuộc trước.
          </p>
        </Panel>
      </div>
      <Modal
        open={!!editing}
        title={editing?.mode === 'edit' ? `Sửa đơn vị ${editing.unit.code}` : 'Thêm đơn vị'}
        okText="Lưu"
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        confirmLoading={save.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {editing?.mode === 'create' && (
            <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true, pattern: /^[A-Za-z0-9_-]{2,20}$/ }]}>
              <Input placeholder="VD: KCNTT" />
            </Form.Item>
          )}
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          {!(editing?.mode === 'edit' && editing.unit.parentId === null) && (
            <Form.Item name="parentId" label="Thuộc đơn vị" rules={[{ required: true }]}>
              <TreeSelect treeData={parentTree} treeDefaultExpandAll />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
