import type { ThemeConfig } from 'antd';

/** Bảng màu dùng chung (cùng hệ với vntongsign: slate + xanh #2563eb). */
export const colors = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  bg: '#f8fafc',
  text: '#0f172a',
  textMuted: '#64748b',
  navText: '#3d4d63',
  border: '#e2e8f0',
  borderSoft: '#f1f5f9',
};

const FONT =
  "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorInfo: colors.primary,
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorError: '#e11d48',
    colorText: colors.text,
    colorTextSecondary: colors.textMuted,
    colorBgLayout: colors.bg,
    colorBorder: '#dce1e6',
    colorBorderSecondary: colors.border,
    colorSplit: colors.borderSoft,
    fontFamily: FONT,
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 38,
    boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  components: {
    Button: { fontWeight: 600, primaryShadow: '0 4px 12px -4px rgba(37, 99, 235, 0.45)' },
    Card: { headerFontSize: 15, paddingLG: 20 },
    Table: {
      headerBg: colors.bg,
      headerColor: colors.textMuted,
      headerSplitColor: 'transparent',
      rowHoverBg: '#f8fbff',
      cellPaddingBlock: 12,
    },
    Tag: { defaultBg: colors.borderSoft },
    Modal: { titleFontSize: 17 },
    Input: { activeShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)' },
    Select: { optionSelectedBg: '#eff6ff' },
    Descriptions: { labelBg: colors.bg },
  },
};
