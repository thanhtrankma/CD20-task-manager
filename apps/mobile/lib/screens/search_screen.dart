import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/task_card.dart';
import 'tasks_screen.dart' show openTask;

/// Chờ người dùng ngừng gõ bao lâu thì mới tìm.
const searchDebounce = Duration(milliseconds: 400);

/// Số ký tự tối thiểu để tìm.
const searchMinLength = 2;

const searchPageSize = 20;

/// Tham số GET /tasks cho một lượt tìm (bỏ trống thì không gửi).
Map<String, Object?> searchQuery(String q, {required int page, TaskStatus? status, bool overdue = false}) => {
      'q': q,
      'page': page,
      'pageSize': searchPageSize,
      'status': status?.api,
      if (overdue) 'overdue': '1',
    };

/// Tìm nhiệm vụ theo tên trong mọi việc đồng chí được xem (máy chủ giới hạn phạm vi):
/// GET /tasks?q=&page=&pageSize=20, lọc thêm theo trạng thái, quá hạn; cuộn để tải trang tiếp.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _text = TextEditingController();
  Timer? _debounce;

  /// Từ khóa đang tìm (đã cắt khoảng trắng).
  String _query = '';
  TaskStatus? _status;
  bool _overdue = false;

  /// Máy chủ chưa hỗ trợ `overdue=1` (trả 400): ẩn ô lọc "Quá hạn".
  bool _overdueSupported = true;

  final _items = <TaskRow>[];
  int _page = 0;
  int _total = 0;
  bool _hasMore = false;
  bool _loading = false;
  bool _loaded = false;
  ApiException? _error;
  int _generation = 0;

  late AppServices _app;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _app.events.addListener(_onTasksChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _app.events.removeListener(_onTasksChanged);
    _text.dispose();
    super.dispose();
  }

  bool get _active => _query.length >= searchMinLength;

  /// Có thao tác làm đổi nhiệm vụ (ví dụ ở Chi tiết): tìm lại để trạng thái mới.
  void _onTasksChanged() {
    if (_active) _reload();
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(searchDebounce, () => _commit(text));
  }

  /// Bấm "Tìm" trên bàn phím hoặc đổi bộ lọc: tìm ngay, không chờ.
  void _commitNow() {
    _debounce?.cancel();
    _commit(_text.text, force: true);
  }

  void _commit(String text, {bool force = false}) {
    final q = text.trim();
    if (!force && q == _query) return;
    _query = q;
    _reload();
  }

  void _setStatus(TaskStatus? s) {
    if (s == _status) return;
    setState(() => _status = s);
    _commitNow();
  }

  void _toggleOverdue(bool v) {
    setState(() => _overdue = v);
    _commitNow();
  }

  Future<void> _reload() async {
    _generation++;
    setState(() {
      _items.clear();
      _page = 0;
      _total = 0;
      _hasMore = _active;
      _loaded = false;
      _loading = false;
      _error = null;
    });
    if (_active) await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore || !_active) return;
    _loading = true;
    final gen = _generation;
    final overdue = _overdue && _overdueSupported;
    try {
      final data = await _app.api.get(
        '/tasks',
        query: searchQuery(_query, page: _page + 1, status: _status, overdue: overdue),
      );
      if (!mounted || gen != _generation) return;
      final paged = Paged.fromJson((data as Map).cast(), TaskRow.fromJson);
      setState(() {
        _items.addAll(paged.items);
        _page = paged.page;
        _total = paged.total;
        _hasMore = paged.hasMore && paged.items.isNotEmpty;
        _loaded = true;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _generation) return;
      if (overdue && e.status == 400) {
        // Máy chủ chưa có bộ lọc quá hạn: bỏ lọc, tìm lại, không báo lỗi.
        _loading = false;
        setState(() {
          _overdueSupported = false;
          _overdue = false;
        });
        await _reload();
        return;
      }
      setState(() => _error = e);
    } finally {
      if (gen == _generation) _loading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        flexibleSpace: const HeaderBackground(starSize: 120),
        backgroundColor: Colors.transparent,
        title: const Text('Tìm nhiệm vụ'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: TextField(
              key: const Key('search-field'),
              controller: _text,
              autofocus: true,
              autocorrect: false,
              textInputAction: TextInputAction.search,
              onChanged: _onChanged,
              onSubmitted: (_) => _commitNow(),
              maxLength: 100,
              buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Tên nhiệm vụ, căn cứ...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: ListenableBuilder(
                  listenable: _text,
                  builder: (context, _) => _text.text.isEmpty
                      ? const SizedBox.shrink()
                      : IconButton(
                          tooltip: 'Xóa',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _text.clear();
                            _commitNow();
                          },
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _filters(),
          const Divider(),
          Expanded(child: _results()),
        ],
      ),
    );
  }

  Widget _filters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          if (_overdueSupported) ...[
            FilterChip(
              key: const Key('chip-overdue'),
              label: const Text('Quá hạn'),
              avatar: _overdue ? null : const Icon(Icons.alarm, size: 16),
              selected: _overdue,
              onSelected: _toggleOverdue,
            ),
            const SizedBox(height: 24, child: VerticalDivider(width: 20)),
          ],
          ChoiceChip(
            label: const Text('Tất cả'),
            selected: _status == null,
            onSelected: (_) => _setStatus(null),
          ),
          for (final s in TaskStatus.values) ...[
            const SizedBox(width: 6),
            ChoiceChip(
              key: Key('chip-${s.api}'),
              label: Text(statusTone[s]!.label),
              selected: _status == s,
              onSelected: (v) => _setStatus(v ? s : null),
            ),
          ],
        ],
      ),
    );
  }

  Widget _results() {
    if (!_active) {
      return CenterMessage(
        icon: Icons.manage_search,
        text: _query.isEmpty
            ? 'Nhập tên nhiệm vụ để tìm trong mọi việc đồng chí được xem'
            : 'Nhập ít nhất $searchMinLength ký tự để tìm',
      );
    }
    if (!_loaded && _error == null) return const Center(child: CircularProgressIndicator());
    if (!_loaded) {
      return CenterMessage(
        icon: Icons.cloud_off,
        text: _error!.message,
        action: OutlinedButton(onPressed: _reload, child: const Text('Thử lại')),
      );
    }
    if (_items.isEmpty) {
      return const CenterMessage(icon: Icons.search_off, text: 'Không tìm thấy nhiệm vụ phù hợp');
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) _loadMore();
          return false;
        },
        child: ListView.builder(
          key: const Key('search-results'),
          padding: const EdgeInsets.only(bottom: 24),
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: _items.length + 1 + (_hasMore ? 1 : 0),
          itemBuilder: (context, i) {
            if (i == 0) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
                child: Text(
                  'Tìm thấy $_total nhiệm vụ',
                  style: const TextStyle(color: Palette.muted, fontSize: 13, fontWeight: FontWeight.w600),
                ),
              );
            }
            final idx = i - 1;
            if (idx >= _items.length) {
              return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
            }
            final t = _items[idx];
            return TaskCard(task: t, onTap: () => openTask(context, t.id));
          },
        ),
      ),
    );
  }
}
