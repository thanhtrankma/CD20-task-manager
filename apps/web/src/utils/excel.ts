import type { SheetData } from 'write-excel-file/browser';

export type { SheetData };

/** Một trang tính: tên, dữ liệu (dòng đầu là tiêu đề), độ rộng cột. */
export interface ExcelSheet {
  name: string;
  data: SheetData;
  widths: number[];
}

/** Dòng tiêu đề in đậm. */
export const headerRow = (titles: string[]) => titles.map((value) => ({ value, fontWeight: 'bold' as const }));

/** Ghi tệp .xlsx và tải về. Thư viện chỉ tải khi dùng, không làm nặng các trang khác. */
export async function downloadXlsx(fileName: string, sheets: ExcelSheet[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(
    sheets.map((s) => ({ sheet: s.name, data: s.data, columns: s.widths.map((width) => ({ width })) })),
  ).toFile(fileName);
}
