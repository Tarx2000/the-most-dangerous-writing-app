/// Connects application lifecycle and activity to the shared security state.
/// Keeping this above the navigator also covers dialogs and writing routes.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/providers.dart';
import '../../../data/security_providers.dart';

class SecurityBoundary extends ConsumerStatefulWidget {
  const SecurityBoundary({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<SecurityBoundary> createState() => _SecurityBoundaryState();
}

class _SecurityBoundaryState extends ConsumerState<SecurityBoundary>
    with WidgetsBindingObserver {
  bool _routeCanHandlePop = false;
  bool _pinVisible = false;

  // Android predictive Back may bypass Dart entirely when the root Navigator
  // cannot pop. Include the PIN overlay in WidgetsApp's native-back contract.
  void _reportBackHandling() {
    if (!mounted) return;
    NavigationNotification(
      canHandlePop: _pinVisible || _routeCanHandlePop,
    ).dispatch(context);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    ref
        .read(securityControllerProvider)
        .onAppLifecycle(
          state,
          lockTimeoutMins: ref.read(preferencesProvider).lockTimeoutMins,
        );
  }

  void _recordActivity() {
    ref
        .read(securityControllerProvider)
        .keepAlive(
          lockTimeoutMins: ref.read(preferencesProvider).lockTimeoutMins,
        );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(preferencesProvider.select((prefs) => prefs.lockTimeoutMins), (
      _,
      timeout,
    ) {
      ref.read(securityControllerProvider).keepAlive(lockTimeoutMins: timeout);
    });
    final pinVisible = ref.watch(securityControllerProvider).mode.value != null;
    if (pinVisible != _pinVisible) {
      _pinVisible = pinVisible;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _reportBackHandling(),
      );
    }
    return NotificationListener<NavigationNotification>(
      onNotification: (notification) {
        _routeCanHandlePop = notification.canHandlePop;
        _reportBackHandling();
        return true;
      },
      child: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => _recordActivity(),
        onPointerSignal: (_) => _recordActivity(),
        child: Focus(
          onKeyEvent: (_, _) {
            _recordActivity();
            return KeyEventResult.ignored;
          },
          child: widget.child,
        ),
      ),
    );
  }
}
