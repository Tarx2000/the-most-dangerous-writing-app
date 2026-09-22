import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/ui/core/widgets/like_button.dart';

void main() {
  testWidgets('LikeButton toggles uncontrolled and formats counts', (tester) async {
    bool? changedLiked;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: LikeButton(
              size: LikeButtonSize.sm,
              count: 321,
              onLikedChange: (liked) => changedLiked = liked,
            ),
          ),
        ),
      ),
    );

    // Initial count is 321 and unliked
    expect(find.text('321'), findsOneWidget);
    expect(changedLiked, isNull);

    // Tap to like
    await tester.tap(find.byType(LikeButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    expect(changedLiked, isTrue);
    expect(find.text('322'), findsOneWidget);

    // Tap to unlike
    await tester.tap(find.byType(LikeButton));
    await tester.pumpAndSettle();

    expect(changedLiked, isFalse);
    expect(find.text('321'), findsOneWidget);
  });

  testWidgets('LikeButton respects controlled state', (tester) async {
    bool liked = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return Center(
                child: LikeButton(
                  liked: liked,
                  count: 4200,
                  onLikedChange: (val) {
                    setState(() => liked = val);
                  },
                ),
              );
            },
          ),
        ),
      ),
    );

    expect(find.text('4.2k'), findsOneWidget);

    await tester.tap(find.byType(LikeButton));
    await tester.pumpAndSettle();

    expect(liked, isTrue);
    expect(find.text('4.2k'), findsOneWidget); // 4201 formatted is 4.2k
  });

  testWidgets('LikeButton does not toggle when disabled', (tester) async {
    bool changed = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: LikeButton(
              disabled: true,
              count: 98700,
              onLikedChange: (_) => changed = true,
            ),
          ),
        ),
      ),
    );

    expect(find.text('98.7k'), findsOneWidget);
    await tester.tap(find.byType(LikeButton));
    await tester.pumpAndSettle();

    expect(changed, isFalse);
    expect(find.text('98.7k'), findsOneWidget);
  });

  testWidgets('formatCount produces expected strings for different magnitudes', (tester) async {
    expect(LikeButton.formatCount(0), '0');
    expect(LikeButton.formatCount(321), '321');
    expect(LikeButton.formatCount(999), '999');
    expect(LikeButton.formatCount(1000), '1k');
    expect(LikeButton.formatCount(4200), '4.2k');
    expect(LikeButton.formatCount(98700), '98.7k');
    expect(LikeButton.formatCount(100000), '100k');
    expect(LikeButton.formatCount(1200000), '1.2M');
  });
}
