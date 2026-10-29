import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../util/account_security.dart';
import '../widgets/common.dart';

// Đổi mật khẩu, bật / tắt xác thực hai lớp ngay trên ứng dụng: màn hình bắt buộc (lần đầu đăng nhập, vai trò
// bắt buộc 2 lớp) và màn hình mở từ Tài khoản. Không ghi nhật ký mật khẩu, khóa bí mật, mã QR.

/// Ô mật khẩu có nút hiện / ẩn.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.validator,
    this.enabled = true,
    this.autofillHints,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
    this.helperText,
  });

  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  final bool enabled;
  final Iterable<String>? autofillHints;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final String? helperText;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _show = false;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      enabled: widget.enabled,
      obscureText: !_show,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: widget.autofillHints,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onSubmitted,
      validator: widget.validator,
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helperText,
        helperMaxLines: 2,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          tooltip: _show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu',
          icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
          onPressed: () => setState(() => _show = !_show),
        ),
      ),
    );
  }
}

/// Ô nhập mã xác thực 6 chữ số.
class OtpField extends StatelessWidget {
  const OtpField({super.key, required this.controller, this.enabled = true, this.onSubmitted, this.autofocus = false});
  final TextEditingController controller;
  final bool enabled;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      autofocus: autofocus,
      keyboardType: TextInputType.number,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 24, letterSpacing: 8),
      onFieldSubmitted: onSubmitted,
      decoration: const InputDecoration(labelText: 'Mã xác thực (6 chữ số)'),
      validator: (v) => validateOtpCode(v ?? ''),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: color),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: TextStyle(color: color))),
        ],
      ),
    );
  }
}

class _BusyLabel extends StatelessWidget {
  const _BusyLabel({required this.busy, required this.label});
  final bool busy;
  final String label;

  @override
  Widget build(BuildContext context) => busy
      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
      : Text(label);
}

String _messageOf(Object e) => e is ApiException ? e.message : 'Có lỗi xảy ra, đồng chí thử lại';

// ---------------------------------------------------------------------------------------------------------------
// Đổi mật khẩu
// ---------------------------------------------------------------------------------------------------------------

/// Biểu mẫu đổi mật khẩu: mật khẩu hiện tại, mật khẩu mới, nhập lại. Kiểm tra giống máy chủ trước khi gửi.
class ChangePasswordForm extends StatefulWidget {
  const ChangePasswordForm({super.key, this.onDone, this.submitLabel = 'Đổi mật khẩu'});

  /// Gọi sau khi máy chủ nhận mật khẩu mới (204) và đã tải lại thông tin tài khoản.
  final VoidCallback? onDone;
  final String submitLabel;

  @override
  State<ChangePasswordForm> createState() => _ChangePasswordFormState();
}

class _ChangePasswordFormState extends State<ChangePasswordForm> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final auth = AppScope.of(context).auth;
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await auth.changePassword(_current.text, _next.text);
      _current.clear();
      _next.clear();
      _confirm.clear();
      messenger
        ?..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.')));
      widget.onDone?.call();
    } catch (e) {
      if (mounted) setState(() => _error = _messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PasswordField(
              key: const Key('pw-current'),
              controller: _current,
              enabled: !_busy,
              label: 'Mật khẩu hiện tại',
              autofillHints: const [AutofillHints.password],
              validator: (v) => (v ?? '').isEmpty ? 'Nhập mật khẩu hiện tại' : null,
            ),
            const SizedBox(height: 12),
            PasswordField(
              key: const Key('pw-new'),
              controller: _next,
              enabled: !_busy,
              label: 'Mật khẩu mới',
              helperText: 'Ít nhất $minPasswordLength ký tự, gồm cả chữ và số, khác mật khẩu cũ',
              autofillHints: const [AutofillHints.newPassword],
              validator: (v) => validateNewPassword(v ?? '', current: _current.text),
            ),
            const SizedBox(height: 12),
            PasswordField(
              key: const Key('pw-confirm'),
              controller: _confirm,
              enabled: !_busy,
              label: 'Nhập lại mật khẩu mới',
              autofillHints: const [AutofillHints.newPassword],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              validator: (v) => validateConfirmPassword(v ?? '', _next.text),
            ),
            if (_error != null) _ErrorText(_error!),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: _BusyLabel(busy: _busy, label: widget.submitLabel),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bật xác thực hai lớp
// ---------------------------------------------------------------------------------------------------------------

/// Thiết lập xác thực hai lớp: gọi POST /auth/2fa/setup một lần khi mở, hiện khóa (nhóm 4 ký tự, nút sao chép)
/// để nhập tay vào ứng dụng xác thực trên chính điện thoại này, mã QR để quét bằng máy khác, rồi nhập mã 6 số.
/// Khóa và ảnh QR chỉ giữ trong bộ nhớ của màn hình, bỏ khi rời màn hình.
class TwoFactorSetupPanel extends StatefulWidget {
  const TwoFactorSetupPanel({super.key, this.onEnabled});

  /// Gọi sau khi máy chủ kích hoạt (204) và đã tải lại thông tin tài khoản.
  final VoidCallback? onEnabled;

  @override
  State<TwoFactorSetupPanel> createState() => _TwoFactorSetupPanelState();
}

class _TwoFactorSetupPanelState extends State<TwoFactorSetupPanel> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  String? _secret;
  Uint8List? _qr;
  bool _loading = true;
  bool _busy = false;
  bool _copied = false;
  String? _loadError;
  String? _error;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _load();
  }

  @override
  void dispose() {
    // Bỏ khóa và ảnh QR khỏi bộ nhớ; nếu đã sao chép khóa thì xóa luôn bộ nhớ tạm (clipboard).
    _secret = null;
    _qr = null;
    if (_copied) Clipboard.setData(const ClipboardData(text: '')).catchError((_) {});
    _code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // Lần đầu đã ở trạng thái đang tải (không gọi setState trong didChangeDependencies).
    if (_loadError != null) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }
    try {
      final setup = await AppScope.of(context).auth.startTwoFactorSetup();
      final secret = otpSecretFromUrl(setup.otpauthUrl);
      if (!mounted) return;
      setState(() {
        _secret = secret;
        _qr = decodeImageDataUrl(setup.qrDataUrl);
        _loading = false;
        if (secret == null) _loadError = 'Máy chủ không trả về khóa xác thực hợp lệ. Đồng chí thử lại.';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = _messageOf(e);
        });
      }
    }
  }

  Future<void> _copy() async {
    final secret = _secret;
    if (secret == null) return;
    await Clipboard.setData(ClipboardData(text: secret));
    _copied = true;
    if (mounted) showMessage(context, 'Đã sao chép khóa. Dán vào ứng dụng xác thực.');
  }

  Future<void> _enable() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final auth = AppScope.of(context).auth;
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await auth.enableTwoFactor(_code.text.trim());
      messenger
        ?..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Đã bật xác thực hai lớp')));
      widget.onEnabled?.call();
    } catch (e) {
      if (mounted) setState(() => _error = _messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
    }
    if (_loadError != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _ErrorText(_loadError!),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('Thử lại')),
        ],
      );
    }
    final theme = Theme.of(context);
    final username = AppScope.of(context).auth.me?.username ?? '';
    final qr = _qr;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _Step(n: 1, text: 'Cài ứng dụng Google Authenticator hoặc Microsoft Authenticator trên điện thoại.'),
          const _Step(
            n: 2,
            text: 'Trong ứng dụng xác thực, chọn thêm tài khoản → "Nhập khóa thiết lập" '
                '(hoặc "Nhập mã theo cách thủ công"), rồi điền:',
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(0, 4, 0, 8),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7E6),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFF1D9A6)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _KeyValue('Tên tài khoản', username),
                const _KeyValue('Loại khóa', 'Dựa trên thời gian'),
                const SizedBox(height: 6),
                Text('Khóa', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 2),
                SelectableText(
                  formatSecret(_secret!),
                  key: const Key('otp-secret'),
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: Palette.red900,
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.tonalIcon(
                    onPressed: _copy,
                    icon: const Icon(Icons.copy, size: 18),
                    label: const Text('Sao chép khóa'),
                  ),
                ),
              ],
            ),
          ),
          if (qr != null) ...[
            const _Step(n: 0, text: 'Hoặc dùng điện thoại khác cài ứng dụng xác thực để quét mã QR này:'),
            Center(
              child: Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Palette.border),
                ),
                child: Image.memory(
                  qr,
                  key: const Key('otp-qr'),
                  width: 180,
                  height: 180,
                  filterQuality: FilterQuality.none,
                  gaplessPlayback: true,
                  semanticLabel: 'Mã QR thiết lập xác thực hai lớp',
                  errorBuilder: (_, _, _) => const SizedBox(width: 180, height: 180),
                ),
              ),
            ),
          ],
          const _Step(n: 3, text: 'Nhập mã 6 chữ số ứng dụng xác thực đang hiện để hoàn tất:'),
          const SizedBox(height: 4),
          OtpField(controller: _code, enabled: !_busy, onSubmitted: (_) => _enable()),
          if (_error != null) _ErrorText(_error!),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _enable,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _BusyLabel(busy: _busy, label: 'Bật xác thực hai lớp'),
          ),
          const SizedBox(height: 8),
          Text(
            'Không chia sẻ khóa này cho người khác. Mất điện thoại thì đồng chí báo quản trị hệ thống đặt lại.',
            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.n, required this.text});

  /// 0: không đánh số.
  final int n;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            margin: const EdgeInsets.only(right: 8, top: 1),
            decoration: BoxDecoration(color: n == 0 ? Palette.border : Palette.red700, shape: BoxShape.circle),
            child: n == 0
                ? const Icon(Icons.qr_code_2, size: 14, color: Palette.ink)
                : Text('$n', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
          ),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _KeyValue extends StatelessWidget {
  const _KeyValue(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text.rich(TextSpan(children: [
        TextSpan(text: '$label: ', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        TextSpan(text: value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ])),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Màn hình bắt buộc (trước khi vào ứng dụng)
// ---------------------------------------------------------------------------------------------------------------

/// Khung chung của màn hình bắt buộc: đầu trang đỏ có logo như màn đăng nhập, khung trắng nổi, nút đăng xuất.
class SetupScaffold extends StatelessWidget {
  const SetupScaffold({super.key, required this.title, required this.subtitle, required this.child});
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final topPad = MediaQuery.paddingOf(context).top;
    final auth = AppScope.of(context).auth;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SingleChildScrollView(
        child: Column(
          children: [
            SizedBox(
              height: 210 + topPad,
              width: double.infinity,
              child: HeaderBackground(
                starSize: 220,
                child: Padding(
                  padding: EdgeInsets.only(top: topPad + 8, bottom: 40),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      LogoBadge(size: 80),
                      SizedBox(height: 12),
                      OrgLine(),
                      SizedBox(height: 6),
                      Text(
                        'HỆ THỐNG GIAO NHIỆM VỤ',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -28),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 24, offset: Offset(0, 8))],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Star(size: 14, color: Palette.red700),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  title,
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: Palette.ink,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(subtitle, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13)),
                          const SizedBox(height: 16),
                          child,
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -16),
              child: Column(
                children: [
                  TextButton.icon(
                    onPressed: () => auth.logout(),
                    icon: const Icon(Icons.logout),
                    label: const Text('Đăng xuất'),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(24, 4, 24, 16),
                    child: Text(
                      securityNotice,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Color(0xFF9A3412)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bắt buộc đổi mật khẩu (lần đầu đăng nhập). Xong: tải lại /auth/me, bộ định tuyến chuyển tiếp
/// (vào ứng dụng, hoặc sang bật xác thực hai lớp nếu vai trò bắt buộc).
class ForcedChangePasswordScreen extends StatelessWidget {
  const ForcedChangePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final me = AppScope.of(context).auth.me;
    return SetupScaffold(
      title: 'Đổi mật khẩu lần đầu',
      subtitle: 'Đồng chí${me == null ? '' : ' ${me.rankName}'} đang dùng mật khẩu do Nhà trường cấp. '
          'Để bảo đảm an toàn, đồng chí đặt mật khẩu mới trước khi sử dụng.',
      child: const ChangePasswordForm(submitLabel: 'Đổi mật khẩu và tiếp tục'),
    );
  }
}

/// Bắt buộc bật xác thực hai lớp (vai trò bắt buộc theo chính sách máy chủ).
class ForcedTwoFactorScreen extends StatelessWidget {
  const ForcedTwoFactorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const SetupScaffold(
      title: 'Bật xác thực hai lớp',
      subtitle: 'Vai trò của đồng chí bắt buộc dùng xác thực hai lớp. Mỗi lần đăng nhập, ngoài mật khẩu '
          'đồng chí nhập thêm mã 6 chữ số từ ứng dụng xác thực trên điện thoại.',
      child: TwoFactorSetupPanel(),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Mở từ Tài khoản
// ---------------------------------------------------------------------------------------------------------------

class ChangePasswordScreen extends StatelessWidget {
  const ChangePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đổi mật khẩu')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Text(
              'Sau khi đổi, các phiên đăng nhập khác của đồng chí (máy tính, điện thoại khác) bị đăng xuất; '
              'phiên trên điện thoại này vẫn giữ.',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            ChangePasswordForm(onDone: () => context.pop()),
          ],
        ),
      ),
    );
  }
}

class TwoFactorSetupScreen extends StatelessWidget {
  const TwoFactorSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bật xác thực hai lớp')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [TwoFactorSetupPanel(onEnabled: () => context.pop())],
        ),
      ),
    );
  }
}

/// Tắt xác thực hai lớp: nhập mật khẩu và mã hiện tại. Trả về true khi đã tắt.
Future<bool> showDisableTwoFactorDialog(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _DisableTwoFactorDialog(),
  );
  return ok == true;
}

class _DisableTwoFactorDialog extends StatefulWidget {
  const _DisableTwoFactorDialog();

  @override
  State<_DisableTwoFactorDialog> createState() => _DisableTwoFactorDialogState();
}

class _DisableTwoFactorDialogState extends State<_DisableTwoFactorDialog> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppScope.of(context).auth.disableTwoFactor(_password.text, _code.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = _messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      icon: const Icon(Icons.gpp_maybe_outlined),
      title: const Text('Tắt xác thực hai lớp?'),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Tài khoản sẽ chỉ còn bảo vệ bằng mật khẩu. Đồng chí nhập mật khẩu và mã hiện tại để xác nhận.'),
              const SizedBox(height: 12),
              PasswordField(
                key: const Key('disable-password'),
                controller: _password,
                enabled: !_busy,
                label: 'Mật khẩu',
                validator: (v) => (v ?? '').isEmpty ? 'Nhập mật khẩu' : null,
              ),
              const SizedBox(height: 12),
              OtpField(controller: _code, enabled: !_busy, onSubmitted: (_) => _submit()),
              if (_error != null) _ErrorText(_error!),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context, false), child: const Text('Hủy')),
        FilledButton(
          onPressed: _busy ? null : _submit,
          style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
          child: _BusyLabel(busy: _busy, label: 'Tắt'),
        ),
      ],
    );
  }
}
