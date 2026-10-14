# Domain Instruction: Dart & Code Quality

## Scope
All Dart files under `mda_flutter/lib/` and `mda_flutter/test/`.

## Dart Best Practices & Strict Standards
- **`const` Constructors Everywhere**: Use `const` constructors on all widgets, EdgeInsets, TextStyle, and styles where values are known at compile time. This avoids unnecessary widget allocations.
- **Sound Null Safety**: Never use `!` force-unwraps on nullable data unless immediately preceded by an explicit null check or guard. Provide sensible defaults (`?? ''`, `?? 0`).
- **No Untyped `dynamic`**: Avoid `dynamic` types; declare explicit models or generics. When parsing JSON or SQLite rows, use `Map<String, Object?>` and cast with fallbacks.
- **Immutable Domain Models**: Data models in `lib/data/models/` must be immutable with `final` fields and provide `.copyWith()` and `.toJson()` / `.fromJson()` helpers.
- **Error Handling & Logging**: Never use empty `catch (_) {}` blocks. Always catch the specific exception/error, log it with context using domain loggers from `lib/core/logger.dart`, and handle recovery or surface user-facing feedback.
```dart
try {
  await db.update(...);
} catch (e, st) {
  logDb.error('Failed to update note record', e, st);
  rethrow;
}
```

## Static Analysis & Quality Gate
- All code must satisfy `flutter analyze` with **0 warnings and 0 errors**.
- Adhere to rules defined in `analysis_options.yaml` (including `flutter_lints`).
- Always run `flutter analyze` and `flutter test --concurrency=1` before committing or declaring work complete.
