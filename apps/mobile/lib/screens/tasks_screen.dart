import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../util/todo_groups.dart';
import '../widgets/common.dart';
import '../widgets/task_card.dart';
import 'task_manage.dart';

/// Các mục của "Việc của tôi". "todo" là màn hình mặc định.
enum TaskView {
  todo('Cần xử lý'),
  assigned('Được giao'),
  created('Đã giao'),
  review('Chờ duyệt'),
  following('Theo dõi');

  const TaskView(this.label);
  final String label;

  int count(TaskCounts c) => switch (this) {
        todo => c.todo,
        assigned => c.assigned,
        created => c.created,
        review => c.review,
        following => c.following,
      };
}

List<TaskView> viewsFor(Role role) => [
      TaskView.todo,
      TaskView.assigned,
      if (role.canAssign) ...[TaskView.created, TaskView.review],
      TaskView.following,
    ];

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  TaskCounts _counts = const TaskCounts();
  late AppServices _app;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _app.events.addListener(_loadCounts);
    _loadCounts();
  }

  @override
  void dispose() {
    _app.events.removeListener(_loadCounts);
    super.dispose();
  }

  Future<void> _loadCounts() async {
    try {
      final data = await _app.api.get('/tasks/counts');
      if (mounted && data is Map) setState(() => _counts = TaskCounts.fromJson(data.cast()));
    } catch (_) {
      // Số trên mục không quan trọng bằng danh sách; lỗi đã hiện ở danh sách.
    }
  }

  Future<void> _quickAssign() async {
    final id = await showQuickAssign(context);
    if (id == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: const Text('Đã giao nhiệm vụ'),
      action: id > 0 ? SnackBarAction(label: 'Xem', onPressed: () => openTask(context, id)) : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final me = _app.auth.me;
    final role = me?.role ?? Role.staff;
    final views = viewsFor(role);
    return DefaultTabController(
      length: views.length,
      child: Scaffold(
        appBar: AppBar(
          toolbarHeight: 92,
          flexibleSpace: const HeaderBackground(starSize: 150),
          backgroundColor: Colors.transparent,
          titleSpacing: 16,
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const OrgLine(),
            const SizedBox(height: 6),
            const Text('Việc của tôi', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
            if (me != null)
              Text(
                'Đồng chí ${me.rankName} · ${me.unitName}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.82)),
              ),
          ]),
          actions: const [Padding(padding: EdgeInsets.only(right: 14), child: LogoBadge(size: 42))],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [for (final v in views) Tab(child: _TabLabel(v.label, v.count(_counts)))],
          ),
        ),
        floatingActionButton: role.canAssign
            ? FloatingActionButton.extended(
                onPressed: _quickAssign,
                icon: const Icon(Icons.add_task),
                label: const Text('Giao nhanh'),
              )
            : null,
        body: TabBarView(
          children: [
            for (final v in views)
              v == TaskView.todo
                  ? TodoList(onRefreshCounts: _loadCounts)
                  : PagedTaskList(view: v, onRefreshCounts: _loadCounts),
          ],
        ),
      ),
    );
  }
}

class _TabLabel extends StatelessWidget {
  const _TabLabel(this.label, this.count);
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Text(label),
      if (count > 0) ...[
        const SizedBox(width: 6),
        Badge(
          label: Text('$count', style: const TextStyle(fontWeight: FontWeight.w800)),
          backgroundColor: Palette.goldLight,
          textColor: Palette.red900,
        ),
      ],
    ]);
  }
}

void openTask(BuildContext context, int id) => context.push('/task/$id');

/// Mục "Cần xử lý": nhóm theo lý do theo thứ tự máy chủ, không phân trang.
class TodoList extends StatefulWidget {
  const TodoList({super.key, this.onRefreshCounts});
  final Future<void> Function()? onRefreshCounts;

  @override
  State<TodoList> createState() => _TodoListState();
}

class _TodoListState extends State<TodoList> with AutomaticKeepAliveClientMixin {
  List<TodoGroup>? _groups;
  ApiException? _error;
  final _busy = <int>{};
  late AppServices _app;
  bool _init = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _app.events.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    _app.events.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await _app.api.get('/tasks/todo');
      final items = (data is Map && data['items'] is List)
          ? (data['items'] as List).whereType<Map>().map((e) => TaskRow.fromJson(e.cast())).toList()
          : <TaskRow>[];
      if (mounted) {
        setState(() {
          _groups = groupTodo(items);
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _refresh() => Future.wait([_load(), if (widget.onRefreshCounts != null) widget.onRefreshCounts!()]);

  Future<void> _acknowledge(TaskRow t) async {
    setState(() => _busy.add(t.id));
    try {
      await _app.api.post('/tasks/${t.id}/acknowledge');
      if (mounted) showMessage(context, 'Đã xác nhận nhận nhiệm vụ');
      _app.events.changed();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy.remove(t.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final groups = _groups;
    Widget body;
    if (groups == null && _error == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (groups == null) {
      body = CenterMessage(icon: Icons.cloud_off, text: _error!.message, action: _retry());
    } else if (groups.isEmpty) {
      body = const CenterMessage(icon: Icons.task_alt, text: 'Không có việc nào cần xử lý. Tốt lắm!');
    } else {
      body = ListView(
        padding: const EdgeInsets.only(bottom: 88),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          for (final g in groups) ...[
            _GroupHeader(reason: g.reason, count: g.items.length),
            for (final t in g.items)
              TaskCard(
                task: t,
                onTap: () => openTask(context, t.id),
                quickAction: t.status == TaskStatus.newTask && g.reason != TodoReason.review
                    ? FilledButton.icon(
                        onPressed: _busy.contains(t.id) ? null : () => _acknowledge(t),
                        style: FilledButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        icon: const Icon(Icons.check, size: 16),
                        label: const Text('Đã nhận'),
                      )
                    : null,
              ),
          ],
        ],
      );
    }
    return RefreshIndicator(onRefresh: _refresh, child: body);
  }

  Widget _retry() => OutlinedButton(onPressed: _load, child: const Text('Thử lại'));
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.reason, required this.count});
  final TodoReason reason;
  final int count;

  @override
  Widget build(BuildContext context) {
    final color = todoReasonColor[reason]!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
      child: Row(children: [
        Star(size: 13, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            todoReasonLabel[reason]!,
            style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w800, letterSpacing: 0.2),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
          child: Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ),
      ]),
    );
  }
}

/// Các mục còn lại: GET /tasks?view=...&page=N, tải tiếp khi cuộn xuống cuối.
class PagedTaskList extends StatefulWidget {
  const PagedTaskList({super.key, required this.view, this.onRefreshCounts});
  final TaskView view;
  final Future<void> Function()? onRefreshCounts;

  @override
  State<PagedTaskList> createState() => _PagedTaskListState();
}

class _PagedTaskListState extends State<PagedTaskList> with AutomaticKeepAliveClientMixin {
  final _items = <TaskRow>[];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  bool _loaded = false;
  ApiException? _error;
  int _generation = 0;
  late AppServices _app;
  bool _init = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _app.events.addListener(_reload);
    _reload();
  }

  @override
  void dispose() {
    _app.events.removeListener(_reload);
    super.dispose();
  }

  Future<void> _reload() async {
    _generation++;
    _page = 0;
    _hasMore = true;
    _loading = false;
    await _loadMore(reset: true);
  }

  Future<void> _loadMore({bool reset = false}) async {
    if (_loading || !_hasMore) return;
    _loading = true;
    final gen = _generation;
    try {
      final data = await _app.api.get('/tasks', query: {'view': widget.view.name, 'page': _page + 1});
      if (!mounted || gen != _generation) return;
      final paged = Paged.fromJson((data as Map).cast(), TaskRow.fromJson);
      setState(() {
        if (reset) _items.clear();
        _items.addAll(paged.items);
        _page = paged.page;
        _hasMore = paged.hasMore && paged.items.isNotEmpty;
        _loaded = true;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted && gen == _generation) setState(() => _error = e);
    } finally {
      if (gen == _generation) _loading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    Widget body;
    if (!_loaded && _error == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (!_loaded) {
      body = CenterMessage(
          icon: Icons.cloud_off, text: _error!.message, action: OutlinedButton(onPressed: _reload, child: const Text('Thử lại')));
    } else if (_items.isEmpty) {
      body = CenterMessage(icon: Icons.inbox_outlined, text: _emptyText(widget.view));
    } else {
      body = NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) _loadMore();
          return false;
        },
        child: ListView.builder(
          padding: const EdgeInsets.only(top: 6, bottom: 88),
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: _items.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, i) {
            if (i >= _items.length) {
              return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
            }
            final t = _items[i];
            return TaskCard(task: t, onTap: () => openTask(context, t.id));
          },
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => Future.wait([_reload(), if (widget.onRefreshCounts != null) widget.onRefreshCounts!()]),
      child: body,
    );
  }

  String _emptyText(TaskView v) => switch (v) {
        TaskView.assigned => 'Đồng chí chưa được giao nhiệm vụ nào',
        TaskView.created => 'Đồng chí chưa giao nhiệm vụ nào',
        TaskView.review => 'Không có báo cáo nào chờ đồng chí duyệt',
        TaskView.following => 'Đồng chí chưa theo dõi nhiệm vụ nào',
        TaskView.todo => 'Không có việc nào cần xử lý',
      };
}
