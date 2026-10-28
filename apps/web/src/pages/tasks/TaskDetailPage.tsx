import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Progress,
  Row,
  Skeleton,
  Modal,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ArrowLeft,
  BellOff,
  BellPlus,
  CalendarClock,
  CheckCircle2,
  GitBranchPlus,
  Megaphone,
  Paperclip,
  Pencil,
  Upload as UploadIcon,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ItemList, ItemRow } from '../../components/ItemList';
import type { Assignee, FileRef, TaskDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DueTag, Pill, PriorityPill, StatusPill } from '../../components/Pill';
import { DATE_FORMAT, DATETIME_FORMAT } from '../../constants';
import { PageHeader, Panel, useShell } from '../../layouts/shell';
import { ActivityTimeline } from './ActivityTimeline';
import { FILE_ACCEPT, useUserOptions } from './CreateTaskModal';
import { EditTaskModal } from './EditTaskModal';
import { assigneeLabel } from './TasksPage';

const EXTENSION_LABEL = {
  PENDING: { label: 'Chờ xem xét', bg: '#fffbeb', fg: '#b45309' },
  APPROVED: { label: 'Chấp thuận', bg: '#ecfdf5', fg: '#047857' },
  REJECTED: { label: 'Không chấp thuận', bg: '#fff1f2', fg: '#be123c' },
} as const;

/** Người/đơn vị được giao kèm trạng thái đã nhận. */
function AssigneeLine({ a }: { a: Assignee }) {
  return (
    <div>
      {assigneeLabel(a)}{' '}
      {a.acknowledgedAt ? (
        <Typography.Text type="success" style={{ fontSize: 12 }} title={a.acknowledgedBy ? `Xác nhận: ${a.acknowledgedBy.fullName}` : undefined}>
          <CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> đã nhận {dayjs(a.acknowledgedAt).format('DD/MM HH:mm')}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          · chưa nhận
        </Typography.Text>
      )}
    </div>
  );
}

const REVIEW_LABEL = {
  PENDING: { label: 'Chờ duyệt', bg: '#fffbeb', fg: '#b45309' },
  APPROVED: { label: 'Đạt', bg: '#ecfdf5', fg: '#047857' },
  RETURNED: { label: 'Trả lại', bg: '#fff7ed', fg: '#c2410c' },
} as const;

function FileLinks({ files }: { files: FileRef[] }) {
  if (!files.length) return null;
  return (
    <Space orientation="vertical" size={0}>
      {files.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}/download`}>
          <Paperclip size={13} /> {f.originalName} ({Math.ceil(f.size / 1024)} KB)
        </a>
      ))}
    </Space>
  );
}

export function TaskDetailPage() {
  const id = Number(useParams().id);
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const { openCreateTask } = useShell();
  const [commentText, setCommentText] = useState('');
  const [submitForm] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const [extending, setExtending] = useState(false);
  const [addingFollowers, setAddingFollowers] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get<TaskDetail>(`/tasks/${id}`),
  });

  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    try {
      await fn();
      message.success(ok);
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const comment = useMutation({
    mutationFn: (content: string) => api.post(`/tasks/${id}/comments`, { content }),
    onSuccess: () => {
      setCommentText('');
      return qc.invalidateQueries({ queryKey: ['tasks', id] });
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading || !task) {
    return (
      <>
        <PageHeader title="Chi tiết công việc" />
        <div className="shell-content">
          <Panel>
            <Skeleton active />
          </Panel>
        </div>
      </>
    );
  }

  const { manage, work, acknowledge } = task.permissions;
  const open = ['NEW', 'IN_PROGRESS', 'RETURNED'].includes(task.status);
  const active = open || task.status === 'PENDING_REVIEW';
  const pendingExtension = task.extensionRequests.find((r) => r.status === 'PENDING');
  const noteValue = (elId: string) => (document.getElementById(elId) as HTMLTextAreaElement)?.value || undefined;

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={
          <Link to="/tasks" className="muted">
            <ArrowLeft size={12} style={{ verticalAlign: -1 }} /> Việc của tôi
          </Link>
        }
        actions={
          <Space wrap>
            {acknowledge && (
              <Button
                type="primary"
                icon={<CheckCircle2 size={15} />}
                onClick={run(() => api.post(`/tasks/${id}/acknowledge`), 'Đã xác nhận nhận nhiệm vụ')}
              >
                <span className="hide-xs">Đã nhận nhiệm vụ</span>
                <span className="only-xs">Đã nhận</span>
              </Button>
            )}
            {manage && open && (
              <Popconfirm
                title="Nhắc người thực hiện khẩn trương?"
                description="Người thực hiện nhận thông báo ngay (tối đa 3 lần mỗi ngày)"
                onConfirm={run(async () => {
                  const r = await api.post<{ remaining: number }>(`/tasks/${id}/nudge`);
                  message.info(`Hôm nay còn đôn đốc được ${r.remaining} lần`);
                }, 'Đã đôn đốc')}
              >
                <Button icon={<Megaphone size={15} />}>
                  <span className="hide-xs">Đôn đốc</span>
                </Button>
              </Popconfirm>
            )}
            {manage && active && (
              <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
                <span className="hide-xs">Sửa</span>
              </Button>
            )}
            {!manage && !work && (
              <Button
                icon={task.following ? <BellOff size={15} /> : <BellPlus size={15} />}
                onClick={run(
                  () => api.post(`/tasks/${id}/${task.following ? 'unfollow' : 'follow'}`),
                  task.following ? 'Đã bỏ theo dõi' : 'Đã theo dõi',
                )}
              >
                <span className="hide-xs">{task.following ? 'Bỏ theo dõi' : 'Theo dõi'}</span>
              </Button>
            )}
            {work && me?.role === 'UNIT_HEAD' && open && (
              <Button icon={<GitBranchPlus size={15} />} onClick={() => openCreateTask(id)}>
                <span className="hide-xs">Chia việc con</span>
              </Button>
            )}
            {manage && !['DONE', 'CANCELLED'].includes(task.status) && (
              <Popconfirm
                title="Hủy công việc này?"
                onConfirm={run(() => api.patch(`/tasks/${id}`, { status: 'CANCELLED' }), 'Đã hủy')}
              >
                <Button danger icon={<XCircle size={15} />}>
                  <span className="hide-xs">Hủy việc</span>
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />
      <div className="shell-content">
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={16}>
            <Panel title="Thông tin công việc">
              <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
                <Descriptions.Item label="Trạng thái">
                  <Space size={4} wrap>
                    <StatusPill status={task.status} />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Ưu tiên">
                  <PriorityPill priority={task.priority} />
                </Descriptions.Item>
                <Descriptions.Item label="Người giao">{task.createdBy.fullName}</Descriptions.Item>
                <Descriptions.Item label="Hạn">
                  <Space size={6} wrap>
                    {dayjs(task.dueDate).format(DATETIME_FORMAT)}
                    <DueTag dueDate={task.dueDate} status={task.status} />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Chủ trì">
                  {task.assignees.filter((a) => a.role === 'LEAD').map((a) => <AssigneeLine key={a.id} a={a} />)}
                </Descriptions.Item>
                <Descriptions.Item label="Phối hợp">
                  {task.assignees.filter((a) => a.role === 'SUPPORT').map((a) => <AssigneeLine key={a.id} a={a} />)}
                  {!task.assignees.some((a) => a.role === 'SUPPORT') && '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Người theo dõi" span="filled">
                  <Space size={8} wrap>
                    {task.followers.map((f) => f.user.fullName).join(', ') || '—'}
                    {manage && active && (
                      <Button size="small" type="link" onClick={() => setAddingFollowers(true)} style={{ padding: 0 }}>
                        Thêm
                      </Button>
                    )}
                  </Space>
                </Descriptions.Item>
                {task.source && (
                  <Descriptions.Item label="Căn cứ" span="filled">
                    {task.source}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Tiến độ" span="filled">
                  <Progress percent={task.progress} strokeColor="#2563eb" />
                </Descriptions.Item>
                {task.parent && (
                  <Descriptions.Item label="Thuộc việc" span="filled">
                    <Link to={`/tasks/${task.parent.id}`}>{task.parent.title}</Link>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Nội dung" span="filled">
                  <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {task.description || '—'}
                  </Typography.Paragraph>
                </Descriptions.Item>
              </Descriptions>
              {task.children.length > 0 && (
                <ItemList
                  header={`Việc con: ${task.children.filter((c) => c.status === 'DONE').length}/${task.children.length} hoàn thành`}
                  items={task.children}
                  rowKey={(c) => c.id}
                  renderItem={(c) => (
                    <ItemRow
                      title={<Link to={`/tasks/${c.id}`}>{c.title}</Link>}
                      description={
                        <>
                          {c.assignees.filter((a) => a.role === 'LEAD').map(assigneeLabel).join(', ')}
                          {c.assignees.some((a) => !a.acknowledgedAt) && c.status === 'NEW' && ' · chưa nhận'}
                          {' · giao bởi '}
                          {c.createdBy.fullName}
                          <Progress percent={c.progress} size="small" strokeColor="#2563eb" />
                        </>
                      }
                      actions={
                        <>
                          <DueTag dueDate={c.dueDate} status={c.status} />
                          <StatusPill status={c.status} />
                        </>
                      }
                    />
                  )}
                />
              )}
            </Panel>

            <Panel title="Báo cáo kết quả" style={{ marginTop: 20 }}>
              <ItemList
                items={task.submissions}
                rowKey={(s) => s.id}
                emptyText="Chưa có báo cáo"
                renderItem={(s) => (
                  <ItemRow
                    actions={
                      manage &&
                      s.status === 'PENDING' && [
                            <Button
                              key="ok"
                              type="primary"
                              onClick={run(
                                () => api.post(`/submissions/${s.id}/review`, { decision: 'APPROVED' }),
                                'Đã duyệt',
                              )}
                            >
                              Duyệt
                            </Button>,
                            <Popconfirm
                              key="back"
                              title="Trả lại báo cáo?"
                              description={<Input.TextArea id={`note-${s.id}`} placeholder="Lý do" />}
                              onConfirm={run(
                                () =>
                                  api.post(`/submissions/${s.id}/review`, {
                                    decision: 'RETURNED',
                                    note:
                                      (document.getElementById(`note-${s.id}`) as HTMLTextAreaElement)?.value ||
                                      undefined,
                                  }),
                                'Đã trả lại',
                              )}
                            >
                              <Button>Trả lại</Button>
                            </Popconfirm>,
                      ]
                    }
                    title={
                        <Space>
                          {s.submittedBy.fullName}
                          <Typography.Text type="secondary">{dayjs(s.createdAt).format(DATETIME_FORMAT)}</Typography.Text>
                          <Pill tone={REVIEW_LABEL[s.status]} />
                        </Space>
                    }
                    description={
                      <>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{s.content}</div>
                        <FileLinks files={s.attachments} />
                        {s.reviewNote && <Typography.Text type="warning">Nhận xét: {s.reviewNote}</Typography.Text>}
                      </>
                    }
                  />
                )}
              />

              {work && open && (
                <Form
                  form={submitForm}
                  layout="vertical"
                  style={{ marginTop: 16 }}
                  onFinish={run(async () => {
                    const attachmentIds = files.filter((f) => f.status === 'done').map((f) => f.response.id);
                    await api.post(`/tasks/${id}/submissions`, {
                      content: submitForm.getFieldValue('content'),
                      attachmentIds,
                    });
                    submitForm.resetFields();
                    setFiles([]);
                  }, 'Đã nộp báo cáo')}
                >
                  <Form.Item name="content" label="Nộp báo cáo kết quả" rules={[{ required: true }]}>
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Form.Item>
                    <Upload
                      action={`/api/files?taskId=${id}`}
                      fileList={files}
                      onChange={({ fileList }) => setFiles(fileList)}
                      accept={FILE_ACCEPT}
                    >
                      <Button icon={<UploadIcon size={15} />}>Đính kèm tệp</Button>
                    </Upload>
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    Nộp báo cáo
                  </Button>
                </Form>
              )}
            </Panel>
          </Col>

          <Col xs={24} xl={8}>
            {work && open && (
              <Panel title="Cập nhật tiến độ" style={{ marginBottom: 20 }}>
                <Form
                  layout="vertical"
                  initialValues={{ progress: task.progress }}
                  onFinish={(v) => run(() => api.post(`/tasks/${id}/progress`, v), 'Đã cập nhật')()}
                >
                  <Form.Item name="progress" label="Tiến độ (%)" rules={[{ required: true }]}>
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="note" label="Ghi chú">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    Cập nhật
                  </Button>
                </Form>
              </Panel>
            )}

            <Panel title="Tệp đính kèm" style={{ marginBottom: 20 }}>
              {task.attachments.length ? <FileLinks files={task.attachments} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có tệp" />}
            </Panel>

            {(task.extensionRequests.length > 0 || (work && open)) && (
              <Panel title="Gia hạn" style={{ marginBottom: 20 }}>
                {pendingExtension && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    title={`${pendingExtension.requestedBy.fullName} đề nghị gia hạn đến ${dayjs(pendingExtension.newDueDate).format(DATE_FORMAT)}`}
                    description={
                      <>
                        <div style={{ whiteSpace: 'pre-wrap' }}>Lý do: {pendingExtension.reason}</div>
                        {manage && (
                          <Space style={{ marginTop: 8 }} wrap>
                            <Button
                              type="primary"
                              size="small"
                              onClick={run(
                                () => api.post(`/tasks/extensions/${pendingExtension.id}/decide`, { decision: 'APPROVED' }),
                                'Đã chấp thuận gia hạn',
                              )}
                            >
                              Chấp thuận
                            </Button>
                            <Popconfirm
                              title="Không chấp thuận gia hạn?"
                              description={<Input.TextArea id="ext-note" placeholder="Lý do" />}
                              onConfirm={run(
                                () =>
                                  api.post(`/tasks/extensions/${pendingExtension.id}/decide`, {
                                    decision: 'REJECTED',
                                    note: noteValue('ext-note'),
                                  }),
                                'Đã trả lời đề nghị',
                              )}
                            >
                              <Button size="small">Không chấp thuận</Button>
                            </Popconfirm>
                          </Space>
                        )}
                      </>
                    }
                  />
                )}
                {work && open && !pendingExtension && (
                  <Button icon={<CalendarClock size={15} />} onClick={() => setExtending(true)} block>
                    Xin gia hạn
                  </Button>
                )}
                {task.extensionRequests.some((r) => r.status !== 'PENDING') && (
                  <ItemList
                    items={task.extensionRequests.filter((r) => r.status !== 'PENDING')}
                    rowKey={(r) => r.id}
                    renderItem={(r) => (
                      <ItemRow
                        title={
                          <Space size={6} wrap>
                            Đến {dayjs(r.newDueDate).format(DATE_FORMAT)}
                            <Pill tone={EXTENSION_LABEL[r.status]} />
                          </Space>
                        }
                        description={
                          <>
                            {r.requestedBy.fullName}: {r.reason}
                            {r.decisionNote && <div>Trả lời: {r.decisionNote}</div>}
                          </>
                        }
                      />
                    )}
                  />
                )}
              </Panel>
            )}

            <Panel title="Hoạt động" style={{ marginBottom: 20 }}>
              <ActivityTimeline task={task} />
            </Panel>

            <Panel title="Trao đổi">
              <ItemList
                items={task.comments}
                rowKey={(c) => c.id}
                emptyText="Chưa có trao đổi"
                renderItem={(c) => (
                  <ItemRow
                    title={
                      <Space>
                        {c.user.fullName}
                        <Typography.Text type="secondary">{dayjs(c.createdAt).format(DATETIME_FORMAT)}</Typography.Text>
                      </Space>
                    }
                    description={<span style={{ whiteSpace: 'pre-wrap' }}>{c.content}</span>}
                  />
                )}
              />
              <Input.Search
                placeholder="Viết trao đổi..."
                enterButton="Gửi"
                loading={comment.isPending}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onSearch={(v) => {
                  if (v.trim()) comment.mutate(v.trim());
                }}
              />
            </Panel>
          </Col>
        </Row>
      </div>
      <EditTaskModal task={task} open={editing} onClose={() => setEditing(false)} />
      <ExtensionModal taskId={id} dueDate={task.dueDate} open={extending} onClose={() => setExtending(false)} />
      <AddFollowersModal taskId={id} open={addingFollowers} onClose={() => setAddingFollowers(false)} />
    </>
  );
}

/** Người thực hiện đề nghị gia hạn: hạn mới và lý do. */
function ExtensionModal({ taskId, dueDate, open, onClose }: { taskId: number; dueDate: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<{ newDueDate: Dayjs; reason: string }>();
  const send = useMutation({
    mutationFn: (v: { newDueDate: Dayjs; reason: string }) =>
      api.post(`/tasks/${taskId}/extensions`, { newDueDate: v.newDueDate.endOf('day').toISOString(), reason: v.reason }),
    onSuccess: async () => {
      message.success('Đã gửi đề nghị gia hạn');
      onClose();
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => message.error(e.message),
  });
  return (
    <Modal open={open} title="Xin gia hạn" okText="Gửi đề nghị" onOk={() => form.submit()} onCancel={onClose} confirmLoading={send.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => send.mutate(v)}>
        <Typography.Paragraph type="secondary">Hạn hiện tại: {dayjs(dueDate).format(DATE_FORMAT)}</Typography.Paragraph>
        <Form.Item name="newDueDate" label="Đề nghị hạn mới" rules={[{ required: true }]}>
          <DatePicker
            format={DATE_FORMAT}
            style={{ width: '100%' }}
            disabledDate={(d) => d.isBefore(dayjs(dueDate).add(1, 'day'), 'day')}
          />
        </Form.Item>
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, min: 3 }]}>
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Người giao thêm người theo dõi sau khi đã giao. */
function AddFollowersModal({ taskId, open, onClose }: { taskId: number; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const options = useUserOptions(open);
  const [userIds, setUserIds] = useState<number[]>([]);
  const add = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/followers`, { userIds }),
    onSuccess: async () => {
      message.success('Đã thêm người theo dõi');
      setUserIds([]);
      onClose();
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => message.error(e.message),
  });
  return (
    <Modal
      open={open}
      title="Thêm người theo dõi"
      okText="Thêm"
      okButtonProps={{ disabled: !userIds.length }}
      onOk={() => add.mutate()}
      onCancel={onClose}
      confirmLoading={add.isPending}
      destroyOnHidden
    >
      <Select
        mode="multiple"
        value={userIds}
        onChange={setUserIds}
        options={options}
        optionFilterProp="label"
        style={{ width: '100%' }}
        placeholder="Chọn cán bộ"
      />
    </Modal>
  );
}
