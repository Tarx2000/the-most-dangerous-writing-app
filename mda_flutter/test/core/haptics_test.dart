import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/core/haptics.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  setUp(() {
    calls.clear();
    setGlobalHapticsEnabled(true);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          calls.add(call);
          return null;
        });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });
  test(
    'selection feedback uses native haptics even without vibration plugin',
    () async {
      await vibrate(HapticPatterns.tick);
      expect(calls.single.method, 'HapticFeedback.vibrate');
      expect(calls.single.arguments, 'HapticFeedbackType.selectionClick');
    },
  );
  test('rapid ticks are coalesced instead of queuing vibration', () async {
    await vibrate(HapticPatterns.tick);
    await vibrate(HapticPatterns.tick);
    expect(calls, hasLength(1));
  });
  test('disabled feedback respects preference', () async {
    setGlobalHapticsEnabled(false);
    await vibrate(HapticPatterns.tick);
    expect(calls, isEmpty);
  });
  test('press uses a light native impact', () async {
    await vibrate(HapticPatterns.dialPress);
    expect(calls.single.arguments, 'HapticFeedbackType.lightImpact');
  });
}
