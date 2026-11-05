import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Col, Row, Select, Space, Table, Upload } from 'antd';
import dayjs from 'dayjs';
import { Download, FileUp } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { AttendanceImport, StaffRow } from '../../api/types';
import { DATETIME_FORMAT } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { cellText, guessMapping, readGrid, toPunches, type Grid, type Mapping } from '../../utils/punch-file';

const BATCH = 2000;

async function downloadTemplate() {
  await downloadXlsx('mau-du-lieu-cham-cong.xlsx', [
    {
      name: 'Chấm công',
      widths: [16, 22],
      data: [headerRow(['Mã chấm công', 'Ngày giờ']), ['1', '05/10/2026 07:25'], ['1', '05/10/2026 16:35'], ['2', '05/10/2026 07:31']],
    },
  ]);
}

/** Phụ trách nhân sự nhập tệp xuất từ máy chấm công; xem các lần nhập và mã chưa ghép với tài khoản. */
export function HrImportPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [grid, setGrid] = useState<Grid>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const imports = useQuery({ queryKey: ['attendance', 'imports'], queryFn: () => api.get<AttendanceImport[]>('/attendance/imports') });
  const unmatched = useQuery({
    queryKey: ['attendance', 'unmatched'],
    queryFn: () => api.get<{ code: string; count: number; first: string; last: string }[]>('/attendance/unmatched'),
  });
  const staff = useQuery({ queryKey: ['hr', 'staff', 'all'], queryFn: () => api.get<StaffRow[]>('/hr/staff') });

  const width = Math.max(0, ...grid.slice(0, 30).map((r) => r.length));
  const columnOptions = Array.from({ length: width }, (_, c) => ({
    value: c,
    label: `Cột ${c + 1}${mapping?.header ? `: ${cellText(grid[0]?.[c] ?? null)}` : ''}`,
  }));
  const parsed = mapping ? toPunches(grid, mapping) : null;

  const load = async (f: File) => {
    try {
      const g = await readGrid(f);
      setFile(f);
      setGrid(g);
      setMapping(guessMapping(g));
    } catch (e) {
      message.error(`Không đọc được tệp: ${(e as Error).message}`);
    }
    return false;
  };

  const submit = async () => {
    if (!file || !parsed?.punches.length) return;
    setBusy(true);
    try {
      let importId: number | undefined;
      let last: AttendanceImport | undefined;
      for (let i = 0; i < parsed.punches.length; i += BATCH) {
        setProgress(`Đang nhập ${Math.min(i + BATCH, parsed.punches.length)}/${parsed.punches.length} lượt…`);
        last = await api.post<AttendanceImport>('/attendance/import', {
          fileName: file.name,
          importId,
          punches: parsed.punches.slice(i, i + BATCH),
        });
        importId = last.id;
      }
      message.success(
        `Đã nhập ${last!.inserted} lượt mới, bỏ qua ${last!.duplicates} lượt đã có` +
          (last!.unmatched ? `; ${last!.unmatched} lượt có mã chưa ghép` : ''),
      );
      setFile(null);
      setGrid([]);
      setMapping(null);
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const assign = async (code: string, userId: number) => {
    try {
      await api.patch(`/hr/staff/${userId}`, { attendanceCode: code });
      message.success(`Đã ghép mã ${code}`);
      await qc.invalidateQueries({ queryKey: ['attendance'] });
      await qc.invalidateQueries({ queryKey: ['hr', 'staff'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Dữ liệu chấm công"
        subtitle="Nhập tệp xuất từ máy hoặc phần mềm chấm công (.xlsx, .csv, .txt, .dat)"
        actions={
          <Button icon={<Download size={15} />} onClick={downloadTemplate}>
            <span className="hide-xs">Tệp mẫu</span>
          </Button>
        }
      />
      <div className="shell-content">
        <Panel title="Nhập tệp">
          {!file ? (
            <Upload.Dragger accept=".xlsx,.csv,.txt,.dat" showUploadList={false} beforeUpload={load}>
              <p style={{ margin: 8 }}>
                <FileUp size={32} color="#2563eb" />
              </p>
              <p>Kéo tệp vào đây hoặc bấm để chọn</p>
              <p className="muted">
                Mỗi dòng một lượt chấm (mã nhân viên, ngày giờ), hoặc mỗi dòng một ngày với các cột giờ vào, giờ ra. Nhập lại tệp
                cũ không sinh trùng.
              </p>
            </Upload.Dragger>
          ) : (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
                <b>{file.name}</b>
                <span className="muted">{grid.length} dòng</span>
                <Checkbox checked={mapping!.header} onChange={(e) => setMapping({ ...mapping!, header: e.target.checked })}>
                  Dòng đầu là tiêu đề
                </Checkbox>
              </Space>
              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={24} md={8}>
                  <div className="muted">Cột mã chấm công</div>
                  <Select style={{ width: '100%' }} value={mapping!.codeCol} options={columnOptions} onChange={(codeCol) => setMapping({ ...mapping!, codeCol })} />
                </Col>
                <Col xs={24} md={8}>
                  <div className="muted">Cột ngày (hoặc ngày giờ)</div>
                  <Select style={{ width: '100%' }} value={mapping!.dateCol} options={columnOptions} onChange={(dateCol) => setMapping({ ...mapping!, dateCol })} />
                </Col>
                <Col xs={24} md={8}>
                  <div className="muted">Các cột giờ (để trống nếu cột ngày đã có giờ)</div>
                  <Select
                    mode="multiple"
                    allowClear
                    style={{ width: '100%' }}
                    value={mapping!.timeCols}
                    options={columnOptions}
                    onChange={(timeCols) => setMapping({ ...mapping!, timeCols })}
                  />
                </Col>
              </Row>
              <Alert
                showIcon
                style={{ marginBottom: 12 }}
                type={parsed!.punches.length ? (parsed!.skipped.length ? 'warning' : 'success') : 'error'}
                title={
                  `Đọc được ${parsed!.punches.length} lượt chấm` +
                  (parsed!.skipped.length
                    ? `; ${parsed!.skipped.length} dòng không đọc được (dòng ${parsed!.skipped.slice(0, 8).join(', ')}${parsed!.skipped.length > 8 ? '…' : ''})`
                    : '')
                }
              />
              <div className="scroll-x" style={{ marginBottom: 12 }}>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(p) => p.code + p.at}
                  dataSource={parsed!.punches.slice(0, 10)}
                  columns={[
                    { title: 'Mã chấm công', dataIndex: 'code' },
                    { title: 'Thời điểm', dataIndex: 'at', render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm:ss') },
                  ]}
                />
              </div>
              <Space>
                <Button type="primary" loading={busy} disabled={!parsed!.punches.length} onClick={submit}>
                  Nhập {parsed!.punches.length} lượt chấm
                </Button>
                <Button disabled={busy} onClick={() => setFile(null)}>
                  Chọn tệp khác
                </Button>
                {progress && <span className="muted">{progress}</span>}
              </Space>
            </>
          )}
        </Panel>

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={10}>
            <Panel title={`Mã chưa ghép với tài khoản${unmatched.data?.length ? ` (${unmatched.data.length})` : ''}`}>
              <Table
                size="small"
                rowKey="code"
                loading={unmatched.isLoading}
                dataSource={unmatched.data ?? []}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: 'Mọi mã đều đã ghép với tài khoản' }}
                columns={[
                  { title: 'Mã', dataIndex: 'code', width: 80 },
                  {
                    title: 'Lượt chấm',
                    render: (_, r) => (
                      <>
                        {r.count} lượt
                        <div className="muted">
                          {dayjs(r.first).format('DD/MM')} – {dayjs(r.last).format('DD/MM/YYYY')}
                        </div>
                      </>
                    ),
                  },
                  {
                    title: 'Ghép với',
                    width: 220,
                    render: (_, r) => (
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Chọn cán bộ"
                        style={{ width: '100%' }}
                        onChange={(id: number) => assign(r.code, id)}
                        options={(staff.data ?? [])
                          .filter((u) => !u.attendanceCode)
                          .map((u) => ({ value: u.id, label: `${u.fullName} · ${u.unit.name}` }))}
                      />
                    ),
                  },
                ]}
              />
            </Panel>
          </Col>
          <Col xs={24} xl={14}>
            <Panel title="Các lần nhập gần đây">
              <Table<AttendanceImport>
                size="small"
                rowKey="id"
                loading={imports.isLoading}
                dataSource={imports.data ?? []}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 640 }}
                locale={{ emptyText: 'Chưa nhập tệp nào' }}
                columns={[
                  {
                    title: 'Tệp',
                    render: (_, r) => (
                      <>
                        {r.fileName}
                        <div className="muted">
                          {dayjs(r.createdAt).format(DATETIME_FORMAT)} · {r.uploadedBy.fullName}
                        </div>
                      </>
                    ),
                  },
                  {
                    title: 'Khoảng thời gian',
                    width: 170,
                    render: (_, r) =>
                      r.rangeFrom ? `${dayjs(r.rangeFrom).format('DD/MM')} – ${dayjs(r.rangeTo).format('DD/MM/YYYY')}` : '',
                  },
                  { title: 'Mới', dataIndex: 'inserted', width: 70, align: 'right' },
                  { title: 'Trùng', dataIndex: 'duplicates', width: 70, align: 'right' },
                  { title: 'Chưa ghép', dataIndex: 'unmatched', width: 90, align: 'right' },
                ]}
              />
            </Panel>
          </Col>
        </Row>
      </div>
    </>
  );
}
