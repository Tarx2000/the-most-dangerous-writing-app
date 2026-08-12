/// App shell — MaterialApp.router + GoRouter (SPEC §17).
///
/// Transparent-modal screens (Writing, PostWriting) use fade/transparent
/// transitions matching the RN native-stack config. The Home screen hosts
/// StartScreen directly until Phase 3 adds the pager + nav + feed layers.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'ui/core/widgets/pin_pad_modal.dart';
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
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/writing',
      pageBuilder: (context, state) => _transparentPage(
        WritingScreen(params: WritingParams.fromExtra((state.extra as Map?)?.cast<String, dynamic>() ?? {})),
      ),
    ),
    GoRoute(
      path: '/post-writing',
      pageBuilder: (context, state) => _transparentPage(
        PostWritingScreen(noteId: (state.extra as Map?)?['noteId'] as String? ?? ''),
      ),
    ),
    GoRoute(
      path: '/masteries',
      pageBuilder: (context, state) => _transparentPage(const PillarsDashboardScreen()),
      routes: [
        GoRoute(
          path: ':pillarId',
          pageBuilder: (context, state) => _transparentPage(
            PillarDetailScreen(pillarId: state.pathParameters['pillarId'] ?? ''),
          ),
        ),
      ],
    ),
    GoRoute(
      path: '/checkin',
      pageBuilder: (context, state) => _transparentPage(const AlignmentWritingScreen()),
    ),
    GoRoute(
      path: '/vlog',
      pageBuilder: (context, state) {
        final extra = (state.extra as Map?)?.cast<String, dynamic>() ?? {};
        return _transparentPage(VlogRecordingScreen(
          timeIndex: (extra['timeIndex'] as num?)?.toInt() ?? 0,
          isQuickVideo: extra['isQuickVideo'] == true,
        ));
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

class MdaApp extends ConsumerWidget {
  const MdaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'The Most Dangerous Writing App',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: goRouter,
      builder: (context, child) {
        // Full-bleed AMOLED background behind every route + the global
        // PIN pad layer (security is app-wide, rendered above navigation).
        return ColoredBox(
          color: AppColors.background,
          child: Stack(
            children: [
              Positioned.fill(child: child ?? const SizedBox()),
              const PinPadModal(),
            ],
          ),
        );
      },
    );
  }
}
