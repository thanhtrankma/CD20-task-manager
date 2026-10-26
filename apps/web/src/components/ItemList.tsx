import { Empty, Flex, Listy, theme, Typography } from 'antd';
import type { Key, ReactNode } from 'react';

/**
 * Danh sách đơn giản dựng trên `Listy` (thay cho `List` của antd đã lỗi thời từ 6.6):
 * thêm tiêu đề, trạng thái rỗng và đường phân cách giữa các dòng.
 */
export function ItemList<T>({
  items,
  rowKey,
  renderItem,
  header,
  emptyText = 'Không có dữ liệu',
  maxHeight,
}: {
  items: T[];
  rowKey: (item: T) => Key;
  renderItem: (item: T) => ReactNode;
  header?: ReactNode;
  emptyText?: ReactNode;
  maxHeight?: number;
}) {
  const { token } = theme.useToken();
  return (
    <div>
      {header && <div style={{ padding: '8px 0', fontWeight: 600 }}>{header}</div>}
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      ) : (
        <Listy
          items={items}
          rowKey={rowKey}
          virtual={false}
          height={maxHeight}
          styles={{ item: { padding: 0, borderBottom: `1px solid ${token.colorSplit}` } }}
          itemRender={(item) => renderItem(item)}
        />
      )}
    </div>
  );
}

/** Một dòng: tiêu đề, mô tả, nút thao tác bên phải (thay cho List.Item + List.Item.Meta). */
export function ItemRow({
  title,
  description,
  actions,
  onClick,
  muted,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <Flex
      gap={12}
      justify="space-between"
      align="flex-start"
      onClick={onClick}
      style={{ padding: '12px 0', cursor: onClick ? 'pointer' : undefined, opacity: muted ? 0.6 : 1 }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{title}</div>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
      </div>
      {actions && <Flex gap={8}>{actions}</Flex>}
    </Flex>
  );
}
