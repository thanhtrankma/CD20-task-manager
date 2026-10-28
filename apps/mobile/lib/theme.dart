import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Bảng màu nhận diện: đỏ cờ, vàng sao (theo logo Nhà trường, quân kỳ), nền trắng ngà, điểm nhấn xanh ô liu.
abstract final class Palette {
  static const red900 = Color(0xFF6E0C11);
  static const red800 = Color(0xFF8B1016);
  static const red700 = Color(0xFFA3141B); // màu chính
  static const red50 = Color(0xFFFBECEC);
  static const gold = Color(0xFFD4A21A);
  static const goldLight = Color(0xFFF3D27A);
  static const goldDark = Color(0xFF7A5A00);
  static const olive = Color(0xFF4B5D2A);
  static const oliveLight = Color(0xFFEEF2E4);
  static const bg = Color(0xFFF6F4EF);
  static const ink = Color(0xFF1F2328);
  static const muted = Color(0xFF6B6760);
  static const border = Color(0xFFE6E0D4);
}

/// Đầu trang đỏ chuyển sắc (dùng chung cho thanh tiêu đề, màn đăng nhập, màn khóa).
const headerGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Palette.red900, Palette.red700],
);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Palette.red700,
    primary: Palette.red700,
    onPrimary: Colors.white,
    secondary: Palette.gold,
    onSecondary: Palette.red900,
    // Nút phụ (tonal), ô chọn: nền vàng nhạt, chữ đỏ sẫm.
    secondaryContainer: const Color(0xFFFBEFCF),
    onSecondaryContainer: Palette.red900,
    tertiary: Palette.olive,
    surface: Colors.white,
    onSurface: Palette.ink,
    onSurfaceVariant: Palette.muted,
    outlineVariant: Palette.border,
  );
  const radius = BorderRadius.all(Radius.circular(10));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.bg,
    appBarTheme: const AppBarTheme(
      centerTitle: false,
      backgroundColor: Palette.red800,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      titleTextStyle: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: Colors.white,
      unselectedLabelColor: Colors.white.withValues(alpha: 0.72),
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
      indicatorColor: Palette.goldLight,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: Colors.transparent,
      overlayColor: WidgetStatePropertyAll(Colors.white.withValues(alpha: 0.08)),
    ),
    cardTheme: const CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: Palette.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      height: 66,
      indicatorColor: Palette.red50,
      surfaceTintColor: Colors.transparent,
      shadowColor: Colors.black26,
      elevation: 3,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? Palette.red700 : Palette.muted),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? Palette.red700 : Palette.muted,
        ),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: Palette.red700,
      foregroundColor: Colors.white,
      extendedTextStyle: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: const RoundedRectangleBorder(borderRadius: radius),
        side: const BorderSide(color: Palette.border),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Palette.red700, width: 1.6),
      ),
    ),
    dividerTheme: const DividerThemeData(color: Palette.border, space: 1),
    listTileTheme: const ListTileThemeData(iconColor: Palette.red700),
    dialogTheme: const DialogThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.ink,
      actionTextColor: Palette.goldLight,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Palette.red700, linearTrackColor: Palette.border),
  );
}

/// Ngôi sao năm cánh (vẽ, không cần ảnh): dùng làm hình chìm trên đầu trang, dấu đầu dòng.
class StarPainter extends CustomPainter {
  const StarPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final outer = math.min(size.width, size.height) / 2;
    final inner = outer * 0.382;
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final r = i.isEven ? outer : inner;
      final a = -math.pi / 2 + i * math.pi / 5;
      final p = c + Offset(r * math.cos(a), r * math.sin(a));
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path..close(), Paint()..color = color);
  }

  @override
  bool shouldRepaint(StarPainter old) => old.color != color;
}

class Star extends StatelessWidget {
  const Star({super.key, this.size = 12, this.color = Palette.gold});
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: StarPainter(color));
}

/// Nền đầu trang: đỏ chuyển sắc, ngôi sao vàng chìm ở góc phải.
class HeaderBackground extends StatelessWidget {
  const HeaderBackground({super.key, this.child, this.starSize = 180});
  final Widget? child;
  final double starSize;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: headerGradient),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            right: -starSize * 0.22,
            top: -starSize * 0.12,
            child: IgnorePointer(
              child: Star(size: starSize, color: Palette.gold.withValues(alpha: 0.13)),
            ),
          ),
          ?child,
        ],
      ),
    );
  }
}

/// Dòng chữ nhỏ màu vàng "BỘ QUỐC PHÒNG · TRƯỜNG CĐN 20" trên đầu trang.
class OrgLine extends StatelessWidget {
  const OrgLine({super.key, this.color = Palette.goldLight});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Star(size: 10, color: color),
        const SizedBox(width: 6),
        Text(
          'BỘ QUỐC PHÒNG · TRƯỜNG CĐN 20',
          style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.1),
        ),
      ],
    );
  }
}

/// Logo Nhà trường trong vòng tròn trắng viền vàng.
class LogoBadge extends StatelessWidget {
  const LogoBadge({super.key, this.size = 96});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.06),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: Palette.gold, width: size * 0.035),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 18, offset: Offset(0, 6))],
      ),
      child: Image.asset('assets/logo.png', semanticLabel: 'Logo Nhà trường'),
    );
  }
}
