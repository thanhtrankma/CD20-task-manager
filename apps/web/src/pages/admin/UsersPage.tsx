import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, TreeSelect } from 'antd';
import { Plus } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Role, Unit, UserRow } from '../../api/types';
import { DATETIME_FORMAT, ROLE } from '../../constants';
import { buildUnitTree } from '../../utils/units';
import { Pill } from '../../components/Pill';
import { PageHeader, Panel } from '../../layouts/shell';

const PASSWORD_RULES = [
  { required: true },
  { min: 10, message: 'Ít nhất 10 ký tự' },
  { pattern: /(?=.*[a-zA-Z])(?=.*\d)/, message: 'Phải có cả chữ và số' },
];

export function UsersPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.post('/users', v),
    onSuccess: async () => {
      message.success('Đã tạo tài khoản. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.');
      setOpen(false);
      form.resetFields();
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });

  const toggleActive = async (u: UserRow, isActive: boolean) => {
    try {
      await api.patch(`/users/${u.id}`, { isActive });
      await refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const resetPassword = (u: UserRow) => {
    let value = '';
    modal.confirm({
      title: `Đặt lại mật khẩu cho ${u.fullName}`,
      content: (
        <Input.Password
          placeholder="Mật khẩu tạm (≥10 ký tự, có chữ và số)"
          onChange={(e) => (value = e.target.value)}
        />
      ),
      okText: 'Đặt lại',
      onOk: async () => {
        await api.post(`/users/${u.id}/reset-password`, { temporaryPassword: value }).catch((e) => {
          message.error(e.message);
          throw e;
        });
        message.success('Đã đặt lại mật khẩu');
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Tài khoản"
        subtitle={users.data ? `${users.data.length} tài khoản` : undefined}
        actions={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            <span className="hide-xs">Thêm tài khoản</span>
          </Button>
        }
      />
      <div className="shell-content">
        <Panel flush>
          <Table<UserRow>
            rowKey="id"
            loading={users.isLoading}
            dataSource={users.data}
            scroll={{ x: 900 }}
            columns={[
              { title: 'Họ tên', dataIndex: 'fullName' },
              { title: 'Tên đăng nhập', dataIndex: 'username', width: 140 },
              { title: 'Đơn vị', width: 200, render: (_, u) => u.unit.name },
              { title: 'Vai trò', dataIndex: 'role', width: 150, render: (r: Role) => ROLE[r] },
              {
                title: '2FA',
                dataIndex: 'totpEnabled',
                width: 80,
                render: (v: boolean) =>
                  v ? <Pill tone={{ label: 'Bật', bg: '#ecfdf5', fg: '#047857' }} /> : <Pill tone={{ label: 'Tắt', bg: '#f1f5f9', fg: '#64748b' }} />,
              },
              {
                title: 'Đăng nhập gần nhất',
                dataIndex: 'lastLoginAt',
                width: 160,
                render: (d: string | null) => (d ? dayjs(d).format(DATETIME_FORMAT) : '—'),
              },
              {
                title: 'Hoạt động',
                dataIndex: 'isActive',
                width: 100,
                render: (v: boolean, u) => <Switch checked={v} onChange={(c) => toggleActive(u, c)} />,
              },
              {
                title: '',
                width: 140,
                render: (_, u) => (
                  <Space>
                    <Button size="small" onClick={() => resetPassword(u)}>
                      Đặt lại mật khẩu
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      </div>
      <Modal
        open={open}
        title="Thêm tài khoản"
        okText="Tạo"
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        confirmLoading={create.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ role: 'STAFF' }} onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="username"
            label="Tên đăng nhập"
            rules={[{ required: true, pattern: /^[a-z0-9._-]{3,64}$/, message: 'Chữ thường không dấu, số, . - _' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="rank" label="Cấp bậc" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="unitId" label="Đơn vị" rules={[{ required: true }]}>
            <TreeSelect treeData={buildUnitTree(units.data ?? [])} treeDefaultExpandAll />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="temporaryPassword" label="Mật khẩu tạm" rules={PASSWORD_RULES}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
