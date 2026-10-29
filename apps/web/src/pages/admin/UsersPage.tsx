import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Form, Input, Modal, Select, Space, Switch, Table, TreeSelect } from 'antd';
import { FileSpreadsheet, MoreHorizontal, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Role, Unit, UserRow } from '../../api/types';
import { DATETIME_FORMAT, ROLE } from '../../constants';
import { buildUnitTree } from '../../utils/units';
import { Avatar } from '../../components/Avatar';
import { Pill } from '../../components/Pill';
import { PageHeader, Panel } from '../../layouts/shell';
import { ImportUsersModal } from './ImportUsersModal';

const PASSWORD_RULES = [
  { required: true },
  { min: 10, message: 'Ít nhất 10 ký tự' },
  { pattern: /(?=.*[a-zA-Z])(?=.*\d)/, message: 'Phải có cả chữ và số' },
];

export function UsersPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.post('/users', { ...v, email: v.email || undefined }),
    onSuccess: async () => {
      message.success('Đã tạo tài khoản. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.');
      setOpen(false);
      form.resetFields();
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.patch(`/users/${editing!.id}`, { ...v, email: v.email || null }),
    onSuccess: async () => {
      message.success('Đã lưu. Đổi đơn vị, vai trò thì người dùng phải đăng nhập lại.');
      setEditing(null);
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });

  /** Thao tác có xác nhận: mở khóa, đặt lại xác thực hai lớp. */
  const confirmAction = (title: string, content: string, fn: () => Promise<unknown>, ok: string) =>
    modal.confirm({
      title,
      content,
      okText: 'Đồng ý',
      onOk: async () => {
        await fn().catch((e) => {
          message.error(e.message);
          throw e;
        });
        message.success(ok);
        await refresh();
      },
    });

  const locked = (u: UserRow) => !!u.lockedUntil && dayjs(u.lockedUntil).isAfter(dayjs());

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
          <Space>
            <Button icon={<FileSpreadsheet size={16} />} onClick={() => setImporting(true)}>
              <span className="hide-xs">Nhập từ Excel</span>
            </Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
              <span className="hide-xs">Thêm tài khoản</span>
            </Button>
          </Space>
        }
      />
      <div className="shell-content">
        <Panel flush>
          <Table<UserRow>
            rowKey="id"
            loading={users.isLoading}
            dataSource={users.data}
            scroll={{ x: 1240 }}
            columns={[
              {
                title: 'Họ tên',
                dataIndex: 'fullName',
                width: 230,
                render: (name: string, u) => (
                  <Space size={8}>
                    <Avatar name={name} url={u.avatarUrl} id={u.id} size={28} />
                    {name}
                  </Space>
                ),
              },
              { title: 'Tên đăng nhập', dataIndex: 'username', width: 140 },
              { title: 'Thư nhắc việc', dataIndex: 'email', width: 200, render: (e: string | null) => e ?? '—' },
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
                render: (v: boolean, u) => (
                  <Space size={6}>
                    <Switch checked={v} onChange={(c) => toggleActive(u, c)} />
                    {locked(u) && <Pill tone={{ label: 'Đang khóa', bg: '#fff1f2', fg: '#be123c' }} />}
                  </Space>
                ),
              },
              {
                title: '',
                width: 110,
                render: (_, u) => (
                  <Space size={4}>
                    <Button size="small" onClick={() => {
                      setEditing(u);
                      editForm.setFieldsValue({ ...u, email: u.email ?? undefined });
                    }}>
                      Sửa
                    </Button>
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'pw', label: 'Đặt lại mật khẩu', onClick: () => resetPassword(u) },
                          {
                            key: 'unlock',
                            label: 'Mở khóa đăng nhập',
                            disabled: !locked(u),
                            onClick: () =>
                              confirmAction(
                                `Mở khóa ${u.fullName}?`,
                                'Tài khoản bị khóa tạm do nhập sai mật khẩu nhiều lần. Chỉ mở khi đã xác minh đúng người.',
                                () => api.post(`/users/${u.id}/unlock`),
                                'Đã mở khóa',
                              ),
                          },
                          {
                            key: '2fa',
                            label: 'Đặt lại xác thực hai lớp',
                            disabled: !u.totpEnabled,
                            onClick: () =>
                              confirmAction(
                                `Đặt lại xác thực hai lớp cho ${u.fullName}?`,
                                'Dùng khi cán bộ mất hoặc đổi điện thoại. Mọi phiên đăng nhập bị thu hồi; lần đăng nhập sau phải bật lại. Chỉ làm khi đã xác minh trực tiếp đúng người.',
                                () => api.post(`/users/${u.id}/reset-2fa`),
                                'Đã đặt lại xác thực hai lớp',
                              ),
                          },
                          {
                            key: 'avatar',
                            label: 'Gỡ ảnh đại diện',
                            disabled: !u.avatarUrl,
                            onClick: () =>
                              confirmAction(
                                `Gỡ ảnh đại diện của ${u.fullName}?`,
                                'Dùng khi ảnh không phù hợp. Cán bộ có thể chọn ảnh khác.',
                                () => api.del(`/users/${u.id}/avatar`),
                                'Đã gỡ ảnh đại diện',
                              ),
                          },
                        ],
                      }}
                    >
                      <Button size="small" icon={<MoreHorizontal size={14} />} aria-label="Thao tác khác" />
                    </Dropdown>
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
          <Form.Item name="email" label="Thư điện tử (nhận nhắc việc)" rules={[{ type: 'email', message: 'Địa chỉ thư không hợp lệ' }]}>
            <Input placeholder="Không bắt buộc" />
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
      <Modal
        open={!!editing}
        title={`Sửa tài khoản ${editing?.username ?? ''}`}
        okText="Lưu"
        onOk={() => editForm.submit()}
        onCancel={() => setEditing(null)}
        confirmLoading={update.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={(v) => update.mutate(v)}>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Thư điện tử (nhận nhắc việc)" rules={[{ type: 'email', message: 'Địa chỉ thư không hợp lệ' }]}>
            <Input placeholder="Không bắt buộc" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="rank" label="Cấp bậc" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="unitId" label="Đơn vị" rules={[{ required: true }]} extra="Chuyển cán bộ sang đơn vị khác">
            <TreeSelect treeData={buildUnitTree(units.data ?? [])} treeDefaultExpandAll />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </Form>
      </Modal>
      <ImportUsersModal open={importing} onClose={() => setImporting(false)} />
    </>
  );
}
