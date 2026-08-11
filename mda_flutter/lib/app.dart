/// App shell — MaterialApp.router + GoRouter.
/// Routing skeleton: Phase 2+ adds the full stack (Writing, PostWriting,
/// Pillars, Alignment, VlogRecording, Sandbox) with custom transparent-modal
/// transitions per SPEC §17.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'ui/features/home/home_screen.dart';

/// Root navigator config (go_router). Transparent modal routes come later.
final GoRouter goRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
  ],
);

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
        // Full-bleed AMOLED background behind every route.
        return ColoredBox(color: AppColors.background, child: child);
      },
    );
  }
}
