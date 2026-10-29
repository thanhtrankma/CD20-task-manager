import { useMutation } from '@tanstack/react-query';
import { App, Button, Modal, Space, Typography } from 'antd';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Panel } from '../layouts/shell';
import { Avatar } from './Avatar';

const SIZE = 512;

/**
 * Cắt vuông ở giữa, thu nhỏ về 512 × 512 rồi mã hóa lại thành JPEG ngay trên máy:
 * tệp gửi lên nhỏ và không còn thông tin EXIF (vị trí, loại máy) của ảnh gốc.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Không đọc được ảnh. Chọn ảnh JPEG hoặc PNG.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(SIZE, side);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xử lý được ảnh'))), 'image/jpeg', 0.88),
  );
}

/** Ảnh xem trước dùng data: URL (CSP chỉ cho ảnh 'self' và data:, không cho blob:). */
const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Không xử lý được ảnh'));
    reader.readAsDataURL(blob);
  });

export function AvatarPanel() {
  const { me, refresh } = useAuth();
  const { message } = App.useApp();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);

  const closePreview = () => setPreview(null);

  const upload = useMutation({
    mutationFn: (blob: Blob) => {
      const form = new FormData();
      form.append('file', blob, 'avatar.jpg');
      return api.post('/users/me/avatar', form);
    },
    onSuccess: async () => {
      closePreview();
      await refresh();
      message.success('Đã đổi ảnh đại diện');
    },
    onError: (e: Error) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.del('/users/me/avatar'),
    onSuccess: async () => {
      await refresh();
      message.success('Đã xóa ảnh đại diện');
    },
    onError: (e: Error) => message.error(e.message),
  });

  if (!me) return null;
  return (
    <Panel title="Ảnh đại diện">
      <div className="avatar-panel">
        <Avatar name={me.fullName} url={me.avatarUrl} id={me.id} size={88} />
        <div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            Ảnh hiện ở menu, trò chuyện và danh sách cán bộ. Nên dùng ảnh chân dung, rõ mặt.
          </Typography.Paragraph>
          <Space wrap>
            <Button icon={<Camera size={15} />} onClick={() => input.current?.click()}>
              {me.avatarUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
            </Button>
            {me.avatarUrl && (
              <Button danger icon={<Trash2 size={15} />} loading={remove.isPending} onClick={() => remove.mutate()}>
                Xóa ảnh
              </Button>
            )}
          </Space>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="Chọn ảnh đại diện"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) return message.error('Ảnh quá lớn (tối đa 15 MB trước khi thu nhỏ)');
          try {
            const blob = await toSquareJpeg(file);
            setPreview({ blob, url: await toDataUrl(blob) });
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
      />
      <Modal
        open={!!preview}
        title="Xem trước ảnh đại diện"
        okText="Dùng ảnh này"
        cancelText="Chọn lại"
        onOk={() => preview && upload.mutate(preview.blob)}
        onCancel={closePreview}
        confirmLoading={upload.isPending}
      >
        {preview && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}>
            <img src={preview.url} alt="Ảnh đại diện mới" className="avatar-img" style={{ width: 200, height: 200 }} />
            <Typography.Text type="secondary" style={{ marginTop: 10 }}>
              Ảnh được cắt vuông ở giữa.
            </Typography.Text>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
