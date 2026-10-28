import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../services/app_services.dart';
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
      await AppScope.of(context).auth.login(
            _username.text.trim(),
            _password.text,
            otp: _needOtp ? _otp.text.trim() : null,
          );
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
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Image.asset('assets/logo.png', height: 96, semanticLabel: 'Logo Nhà trường'),
                      const SizedBox(height: 16),
                      Text('Giao nhiệm vụ',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('Đăng nhập bằng tài khoản do Nhà trường cấp',
                          textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                      const SizedBox(height: 24),
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
                            border: OutlineInputBorder(),
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
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              tooltip: _showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu',
                              icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                              onPressed: () => setState(() => _showPassword = !_showPassword),
                            ),
                          ),
                          validator: (v) => (v ?? '').isEmpty ? 'Nhập mật khẩu' : null,
                        ),
                      ] else ...[
                        Text('Nhập mã 6 chữ số trong ứng dụng xác thực của đồng chí.',
                            textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('otp'),
                          controller: _otp,
                          enabled: !_busy,
                          autofocus: true,
                          keyboardType: TextInputType.number,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 24, letterSpacing: 8),
                          onFieldSubmitted: (_) => _submit(),
                          decoration: const InputDecoration(labelText: 'Mã xác thực', border: OutlineInputBorder()),
                          validator: (v) => RegExp(r'^\d{6}$').hasMatch(v ?? '') ? null : 'Mã xác thực gồm 6 chữ số',
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
                        Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.error)),
                      ],
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                        child: _busy
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(_needOtp ? 'Xác nhận' : 'Đăng nhập'),
                      ),
                      const SizedBox(height: 24),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF7ED),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFFED7AA)),
                        ),
                        child: const Row(children: [
                          Icon(Icons.shield_outlined, color: Color(0xFFC2410C), size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(securityNotice, style: TextStyle(color: Color(0xFF9A3412), fontSize: 13)),
                          ),
                        ]),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
