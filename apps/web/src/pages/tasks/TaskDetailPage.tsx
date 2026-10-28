import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Progress,
  Row,
  Skeleton,
  Space,
  Timeline,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeft, GitBranchPlus, Paperclip, Upload as UploadIcon, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ItemList, ItemRow } from '../../components/ItemList';
import type { FileRef, TaskDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DueTag, Pill, PriorityPill, StatusPill } from '../../components/Pill';
import { DATETIME_FORMAT } from '../../constants';
import { PageHeader, Panel, useShell } from '../../layouts/shell';
import { assigneeLabel } from './TasksPage';

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

  const { manage, work } = task.permissions;
  const open = ['NEW', 'IN_PROGRESS', 'RETURNED'].includes(task.status);

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
          <Space>
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
                  {task.assignees.filter((a) => a.role === 'LEAD').map(assigneeLabel).join(', ')}
                </Descriptions.Item>
                <Descriptions.Item label="Phối hợp">
                  {task.assignees.filter((a) => a.role === 'SUPPORT').map(assigneeLabel).join(', ') || '—'}
                </Descriptions.Item>
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
                  header="Việc con"
                  items={task.children}
                  rowKey={(c) => c.id}
                  renderItem={(c) => (
                    <ItemRow
                      title={<Link to={`/tasks/${c.id}`}>{c.title}</Link>}
                      actions={<StatusPill status={c.status} />}
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
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.png,.jpg,.jpeg"
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

            <Panel title="Lịch sử tiến độ" style={{ marginBottom: 20 }}>
              {task.updates.length ? (
                <Timeline
                  items={task.updates.map((u) => ({
                    content: (
                      <>
                        <b>{u.progress}%</b> · {u.user.fullName}
                        <br />
                        <Typography.Text type="secondary">{dayjs(u.createdAt).format(DATETIME_FORMAT)}</Typography.Text>
                        {u.note && <div>{u.note}</div>}
                      </>
                    ),
                  }))}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa cập nhật" />
              )}
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
    </>
  );
}
