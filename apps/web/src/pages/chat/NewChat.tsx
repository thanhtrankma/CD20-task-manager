import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Checkbox, Form, Input, Modal, Select, Spin, TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { ConversationItem, Unit, UserBrief } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { buildUnitTree } from '../../utils/units';

/** Chọn người trong danh bạ, tìm theo tên trên máy chủ. */
export function PersonSelect({
  value,
  onChange,
  multiple,
  exclude = [],
}: {
  value?: number | number[];
  onChange?: (v: number | number[]) => void;
  multiple?: boolean;
  exclude?: number[];
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ['chat-directory', debounced],
    queryFn: () => api.get<UserBrief[]>(`/chat/directory${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`),
  });
  // Giữ tên những người đã chọn khi kết quả tìm kiếm đổi.
  const [known, setKnown] = useState(new Map<number, UserBrief>());
  useEffect(() => {
    if (data) setKnown((m) => new Map([...m, ...data.map((u) => [u.id, u] as const)]));
  }, [data]);

  const options = [...known.values()]
    .filter((u) => !exclude.includes(u.id) && (data?.some((d) => d.id === u.id) || [value].flat().includes(u.id)))
    .map((u) => ({
      value: u.id,
      label: u.fullName,
      person: u,
    }));

  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      showSearch={{ filterOption: false, onSearch: setQ }}
      value={value}
      onChange={onChange}
      placeholder="Gõ tên để tìm"
      notFoundContent={isFetching ? <Spin size="small" /> : 'Không tìm thấy'}
      options={options}
      optionRender={(o) => {
        const u = o.data.person as UserBrief;
        return (
          <div className="person-option">
            <Avatar name={u.fullName} url={u.avatarUrl} id={u.id} size={28} />
            <div style={{ minWidth: 0 }}>
              <div className="person-name">{u.fullName}</div>
              <div className="person-meta">{[u.rank, u.position, u.unit.name].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        );
      }}
    />
  );
}

export type NewChatKind = 'direct' | 'group' | 'unit';

export function NewChatModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: NewChatKind | null;
  onClose: () => void;
  onCreated: (c: ConversationItem) => void;
}) {
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => api.get<Unit[]>('/units'),
    enabled: kind === 'unit',
  });

  // Chỉ huy đơn vị: chỉ chọn được đơn vị mình và trực thuộc.
  const unitTree = useMemo(() => {
    const tree = buildUnitTree(units.data ?? []);
    if (me?.role !== 'UNIT_HEAD') return tree;
    const find = (nodes: typeof tree): typeof tree =>
      nodes.flatMap((n) => (n.value === me.unitId ? [n] : find(n.children)));
    return find(tree);
  }, [units.data, me]);

  const create = useMutation({
    mutationFn: (v: { userId?: number; name?: string; memberIds?: number[]; unitId?: number; includeSubunits?: boolean }) =>
      kind === 'direct'
        ? api.post<ConversationItem>('/chat/direct', { userId: v.userId })
        : kind === 'group'
          ? api.post<ConversationItem>('/chat/groups', { name: v.name, memberIds: v.memberIds })
          : api.post<ConversationItem>('/chat/unit-groups', { unitId: v.unitId, includeSubunits: !!v.includeSubunits }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      form.resetFields();
      onCreated(c);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const title = { direct: 'Nhắn riêng', group: 'Tạo nhóm', unit: 'Nhóm theo đơn vị' }[kind ?? 'direct'];
  return (
    <Modal
      open={kind !== null}
      title={title}
      okText={kind === 'direct' ? 'Mở trò chuyện' : 'Tạo nhóm'}
      cancelText="Hủy"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={create.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={create.mutate} preserve={false}>
        {kind === 'direct' && (
          <Form.Item name="userId" label="Người nhận" rules={[{ required: true, message: 'Chọn người nhận' }]}>
            <PersonSelect />
          </Form.Item>
        )}
        {kind === 'group' && (
          <>
            <Form.Item name="name" label="Tên nhóm" rules={[{ required: true, whitespace: true, message: 'Nhập tên nhóm' }]}>
              <Input maxLength={100} placeholder="Ví dụ: Tổ soạn đề thi học kỳ" />
            </Form.Item>
            <Form.Item name="memberIds" label="Thành viên" rules={[{ required: true, message: 'Chọn ít nhất một người' }]}>
              <PersonSelect multiple />
            </Form.Item>
          </>
        )}
        {kind === 'unit' && (
          <>
            <Form.Item
              name="unitId"
              label="Đơn vị"
              rules={[{ required: true, message: 'Chọn đơn vị' }]}
              extra="Thành viên tự cập nhật theo đơn vị của tài khoản; mỗi đơn vị một nhóm."
            >
              <TreeSelect treeData={unitTree} treeDefaultExpandAll loading={units.isLoading} placeholder="Chọn đơn vị" />
            </Form.Item>
            <Form.Item name="includeSubunits" valuePropName="checked">
              <Checkbox>Gồm cả cán bộ các đơn vị trực thuộc</Checkbox>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
