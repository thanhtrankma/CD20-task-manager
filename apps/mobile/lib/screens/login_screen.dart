import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Đăng nhập bằng tài khoản do Nhà trường cấp; bước 2 nhập mã xác thực hai lớp khi máy chủ yêu cầu.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _otp = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _needOtp = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = AppScope.of(context).auth;
    final notice = auth.notice;
    if (notice != null) {
      auth.notice = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) showMessage(context, notice);
      });
    }
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppScope.of(context).auth
          .login(_username.text.trim(), _password.text, otp: _needOtp ? _otp.text.trim() : null);
      // Bộ định tuyến tự chuyển màn hình khi trạng thái đăng nhập đổi.
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isOtpRequired) {
        setState(() {
          // Lần đầu: chuyển sang bước nhập mã. Đã nhập mã mà vẫn báo: mã sai.
          _error = _needOtp ? e.message : null;
          _needOtp = true;
        });
      } else {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final topPad = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Đầu trang: nền đỏ, sao vàng chìm, logo viền vàng, tên Nhà trường.
            SizedBox(
              height: 300 + topPad,
              width: double.infinity,
              child: HeaderBackground(
                starSize: 260,
                child: Padding(
                  padding: EdgeInsets.only(top: topPad + 8, bottom: 44),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const LogoBadge(size: 104),
                      const SizedBox(height: 16),
                      const Text(
                        'BỘ QUỐC PHÒNG',
                        style: TextStyle(
                          color: Palette.goldLight,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'TRƯỜNG CAO ĐẲNG NGHỀ SỐ 20',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(width: 28, height: 1, color: Palette.goldLight),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8),
                            child: Star(size: 10, color: Palette.goldLight),
                          ),
                          Container(width: 28, height: 1, color: Palette.goldLight),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'HỆ THỐNG GIAO NHIỆM VỤ',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Khung đăng nhập nổi lên trên đầu trang.
            Transform.translate(
              offset: const Offset(0, -32),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 24, offset: Offset(0, 8))],
                      ),
                      child: Form(
                        key: _formKey,
                        child: AutofillGroup(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                _needOtp ? 'Xác thực hai lớp' : 'Đăng nhập hệ thống',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: Palette.ink,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _needOtp
                                    ? 'Tài khoản của đồng chí đã bật xác thực hai lớp.'
                                    : 'Dùng tài khoản do Nhà trường cấp, không cho người khác sử dụng.',
                                style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13),
                              ),
                              const SizedBox(height: 18),
                              if (!_needOtp) ...[
                                TextFormField(
                                  controller: _username,
                                  enabled: !_busy,
                                  autofillHints: const [AutofillHints.username],
                                  textInputAction: TextInputAction.next,
                                  autocorrect: false,
                                  enableSuggestions: false,
                                  decoration: const InputDecoration(
                                    labelText: 'Tên đăng nhập',
                                    prefixIcon: Icon(Icons.person_outline),
                                  ),
                                  validator: (v) => (v ?? '').trim().isEmpty ? 'Nhập tên đăng nhập' : null,
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _password,
                                  enabled: !_busy,
                                  obscureText: !_showPassword,
                                  autofillHints: const [AutofillHints.password],
                                  textInputAction: TextInputAction.done,
                                  onFieldSubmitted: (_) => _submit(),
                                  decoration: InputDecoration(
                                    labelText: 'Mật khẩu',
                                    prefixIcon: const Icon(Icons.lock_outline),
                                    suffixIcon: IconButton(
                                      tooltip: _showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu',
                                      icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                                      onPressed: () => setState(() => _showPassword = !_showPassword),
                                    ),
                                  ),
                                  validator: (v) => (v ?? '').isEmpty ? 'Nhập mật khẩu' : null,
                                ),
                              ] else ...[
                                Text(
                                  'Nhập mã 6 chữ số trong ứng dụng xác thực của đồng chí.',
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  key: const Key('otp'),
                                  controller: _otp,
                                  enabled: !_busy,
                                  autofocus: true,
                                  keyboardType: TextInputType.number,
                                  autofillHints: const [AutofillHints.oneTimeCode],
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                    LengthLimitingTextInputFormatter(6),
                                  ],
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 24, letterSpacing: 8),
                                  onFieldSubmitted: (_) => _submit(),
                                  decoration: const InputDecoration(labelText: 'Mã xác thực'),
                                  validator: (v) =>
                                      RegExp(r'^\d{6}$').hasMatch(v ?? '') ? null : 'Mã xác thực gồm 6 chữ số',
                                ),
                                TextButton(
                                  onPressed: _busy
                                      ? null
                                      : () => setState(() {
                                          _needOtp = false;
                                          _otp.clear();
                                          _error = null;
                                        }),
                                  child: const Text('Quay lại'),
                                ),
                              ],
                              if (_error != null) ...[
                                const SizedBox(height: 12),
                                Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: theme.colorScheme.error),
                                ),
                              ],
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: _busy ? null : _submit,
                                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                                child: _busy
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : Text(_needOtp ? 'Xác nhận' : 'Đăng nhập'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7E6),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFF1D9A6)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.shield_outlined, color: Palette.red700, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(securityNotice, style: TextStyle(color: Palette.red900, fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
