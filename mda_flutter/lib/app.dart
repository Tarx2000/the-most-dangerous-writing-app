/// App shell — MaterialApp.router + GoRouter (SPEC §17).
///
/// Transparent-modal screens (Writing, PostWriting) use fade/transparent
/// transitions matching the RN native-stack config. The Home screen hosts
/// StartScreen alongside the library pager, navigation, and feed layers.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'data/security_providers.dart';
import 'ui/core/widgets/pin_pad_modal.dart';
import 'ui/core/widgets/security_boundary.dart';
import 'ui/features/alignment/alignment_writing_screen.dart';
import 'ui/features/home/home_screen.dart';
import 'ui/features/pillars/pillar_detail_screen.dart';
import 'ui/features/pillars/pillars_dashboard_screen.dart';
import 'ui/features/post_writing/post_writing_screen.dart';
import 'ui/features/vlogs/vlog_recording_screen.dart';
import 'ui/features/writing/writing_screen.dart';

/// Root navigator config (go_router).
final GoRouter goRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
    GoRoute(
      path: '/writing',
      pageBuilder: (context, state) => _transparentPage(
        WritingScreen(
          params: WritingParams.fromExtra(
            (state.extra as Map?)?.cast<String, dynamic>() ?? {},
          ),
        ),
      ),
    ),
    GoRoute(
      path: '/post-writing',
      pageBuilder: (context, state) => _transparentPage(
        PostWritingScreen(
          noteId: (state.extra as Map?)?['noteId'] as String? ?? '',
        ),
      ),
    ),
    GoRoute(
      path: '/masteries',
      pageBuilder: (context, state) =>
          _transparentPage(const PillarsDashboardScreen()),
      routes: [
        GoRoute(
          path: ':pillarId',
          pageBuilder: (context, state) => _transparentPage(
            PillarDetailScreen(
              pillarId: state.pathParameters['pillarId'] ?? '',
            ),
          ),
        ),
      ],
    ),
    GoRoute(
      path: '/checkin',
      pageBuilder: (context, state) => _transparentPage(
        AlignmentWritingScreen(
          isWeekly: (state.extra as Map?)?['isWeekly'] == true,
        ),
      ),
    ),
    GoRoute(
      path: '/vlog',
      pageBuilder: (context, state) {
        final extra = (state.extra as Map?)?.cast<String, dynamic>() ?? {};
        return _transparentPage(
          VlogRecordingScreen(
            timeIndex: (extra['timeIndex'] as num?)?.toInt() ?? 0,
            isQuickVideo: extra['isQuickVideo'] == true,
          ),
        );
      },
    ),
  ],
);

/// Transparent-modal page: the screen fades in over the home content
/// (parity with the RN `presentation: transparentModal` config).
Page<void> _transparentPage(Widget child) {
  return CustomTransitionPage<void>(
    child: child,
    opaque: false,
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 220),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(opacity: animation, child: child);
    },
  );
}

/// The PIN layer sits above the navigator, so route-local PopScope cannot see
/// it. Consume Back here before it reaches (and exits) the underlying route.
final _backDispatcherProvider = Provider<RootBackButtonDispatcher>(
  (ref) => _SecurityBackDispatcher(() {
    final security = ref.read(securityControllerProvider);
    if (security.mode.value == null) return false;
    security.cancel();
    return true;
  }),
);

class _SecurityBackDispatcher extends RootBackButtonDispatcher {
  _SecurityBackDispatcher(this.dismissPin);
  final bool Function() dismissPin;
  @override
  Future<bool> didPopRoute() async => dismissPin() || await super.didPopRoute();
}

class MdaApp extends ConsumerWidget {
  const MdaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'The Most Dangerous Writing App',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerDelegate: goRouter.routerDelegate,
      routeInformationParser: goRouter.routeInformationParser,
      routeInformationProvider: goRouter.routeInformationProvider,
      backButtonDispatcher: ref.watch(_backDispatcherProvider),
      builder: (context, child) {
        // Full-bleed AMOLED background behind every route + the global
        // PIN pad layer (security is app-wide, rendered above navigation).
        return SecurityBoundary(
          child: ColoredBox(
            color: AppColors.background,
            child: Stack(
              children: [
                Positioned.fill(child: child ?? const SizedBox()),
                const PinPadModal(),
              ],
            ),
          ),
        );
      },
    );
  }
}
