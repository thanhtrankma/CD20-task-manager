import type { Unit } from '../api/types';

export interface UnitNode {
  value: number;
  title: string;
  key: number;
  children: UnitNode[];
}

/** Dựng cây đơn vị (cho Tree, TreeSelect) từ danh sách phẳng. Mặc định bỏ đơn vị đã ẩn (không chọn được nữa). */
export function buildUnitTree(all: Unit[], { includeInactive = false } = {}): UnitNode[] {
  const units = includeInactive ? all : all.filter((u) => u.isActive);
  const nodes = new Map<number, UnitNode>(
    units.map((u) => [u.id, { value: u.id, key: u.id, title: u.name, children: [] }]),
  );
  const roots: UnitNode[] = [];
  for (const u of units) {
    const node = nodes.get(u.id)!;
    const parent = u.parentId !== null ? nodes.get(u.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}
