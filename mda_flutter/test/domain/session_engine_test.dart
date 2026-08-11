/// Unit tests for the session engine (SPEC §8) — timer, death, haptics,
/// word counting and save outcomes.
library;

import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/domain/use_cases/session_engine.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('death triggers after the difficulty limit of idling', () async {
    final deathNotifier = Completer<void>();
    final engine = SessionEngine(
      callbacks: SessionCallbacks(onDeath: () {
        if (!deathNotifier.isCompleted) deathNotifier.complete();
      }),
    );
    engine.start(difficultyLimitMs: 8000, sessionDurationMin: 5);

    // Simulate 8.1 s of idling (10 Hz ticks).
    for (var i = 0; i < 82; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await deathNotifier.future.timeout(const Duration(seconds: 2));
    expect(engine.phase.value, SessionPhase.death);
    engine.dispose();
  });

  test('typing resets the idle timer and prevents death', () async {
    final engine = SessionEngine();
    var died = false;
    engine.start(difficultyLimitMs: 5000, sessionDurationMin: 3);

    for (var i = 0; i < 30; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      engine.handleTextChange('word $i');
      engine.phase.addListener(() {
        if (engine.phase.value == SessionPhase.death) died = true;
      });
    }
    // 3 s of alternating typing/100 ms idle → never reaches 5 s idle.
    expect(died, isFalse);
    expect(engine.phase.value, SessionPhase.writing);
    engine.dispose();
  });

  test('quick notes have no session timer', () async {
    final engine = SessionEngine();
    engine.start(difficultyLimitMs: 8000, sessionDurationMin: 5, quickNote: true);
    expect(engine.sessionSecondsRemaining.value, isNull);
    engine.dispose();
  });

  test('session countdown reaches zero and fires onSessionEnd', () {
    // fakeAsync drives the 1 s Timer.periodic ticks deterministically.
    // Difficulty limit is far beyond the session so idle-death never fires.
    fakeAsync((async) {
      var ended = false;
      final engine = SessionEngine(
        callbacks: SessionCallbacks(onSessionEnd: () => ended = true),
      );
      engine.start(difficultyLimitMs: 10 * 60 * 1000, sessionDurationMin: 3);
      expect(engine.sessionSecondsRemaining.value, 180);

      async.elapse(const Duration(minutes: 3));
      expect(ended, isTrue);
      expect(engine.sessionSecondsRemaining.value, 0);
      expect(engine.canSave, isTrue);
      engine.dispose();
    });
  });

  test('word count fast path (append-only)', () async {
    final engine = SessionEngine();
    engine.start(difficultyLimitMs: 8000, sessionDurationMin: 5);
    engine.handleTextChange('hello ');
    engine.handleTextChange('hello world');
    engine.handleTextChange('hello world again');
    expect(engine.wordCount.value, 3);
    engine.dispose();
  });

  test('death wipe clears the word count after 200 ms', () async {
    final engine = SessionEngine(
      callbacks: SessionCallbacks(),
    );
    engine.start(difficultyLimitMs: 500, sessionDurationMin: 3);
    engine.handleTextChange('a b c d');
    expect(engine.wordCount.value, 4);

    await Future<void>.delayed(const Duration(milliseconds: 900));
    expect(engine.phase.value, SessionPhase.death);
    expect(engine.wordCount.value, 0);
    engine.dispose();
  });

  test('resumeWritingFreely continues without death risk and saves won:false', () async {
    final engine = SessionEngine();
    engine.start(difficultyLimitMs: 500, sessionDurationMin: 3);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    expect(engine.phase.value, SessionPhase.death);

    engine.resumeWritingFreely();
    expect(engine.phase.value, SessionPhase.continuingAfterLoss);
    final outcome = engine.buildSaveOutcome();
    expect(outcome.won, isFalse);
    expect(outcome.durationMin, 3);
    engine.dispose();
  });

  test('buildSaveOutcome: won session', () async {
    final engine = SessionEngine();
    engine.start(difficultyLimitMs: 8000, sessionDurationMin: 5);
    engine.skipTimer(); // session end without loss
    final outcome = engine.buildSaveOutcome();
    expect(outcome.won, isTrue);
    expect(outcome.durationMin, 5);
    engine.dispose();
  });
}
