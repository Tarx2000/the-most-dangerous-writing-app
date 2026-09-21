# The Most Dangerous Writing App

A journaling app where if you stop typing, your text is destroyed. This is a **monorepo** containing two implementations of the same app:

| Folder | Implementation | Status |
|---|---|---|
| [`mda_flutter/`](mda_flutter/) | Flutter (Dart 3.12, Flutter 3.44) | **The app** — built, installed and used |
| [`mda_rn/`](mda_rn/) | React Native (Expo SDK 55, React 19, Reanimated 4) | Legacy — no longer built or installed (kept as behavioral reference) |

## Features

- **Timed Writing Sessions** — Write for 3–60 minutes; stop typing and your text fades away
- **Difficulty Modes** — Easy (12s), Mid (8s), Hard (5s) idle limits
- **Quick Notes** — No timer, no death — just write
- **AI Titles & Summaries** — Auto-generated via Ollama Cloud (Kimi K2.5, Qwen 3.5, etc.)
- **Circles** — Link journal entries to people in your life
- **Vlog Recording** — Front-camera video journals with calendar gallery
- **Vision Board / Masteries** — Four life areas (Health, Career, Relationships, Mindset)
- **Alignment Check-ins** — Weekly reflection with 1–10 score slider
- **Biometric Security** — 3-tier unlock (locked → circles → full access)
- **Streak Tracking** — Calendar-based streak visualization
- **Social Feed** — Timeline of all entries with bookmarks and comments

## Getting Started

### Flutter (`mda_flutter/`) — the app

```bash
cd mda_flutter
flutter pub get
flutter run           # Debug on emulator/device
flutter test --concurrency=1   # Test suite
```

Release APK builds: see `.agents/workflows/expo-build.md` (opencode command `/expo-build`).
APK output: `mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`.

### React Native (`mda_rn/`) — legacy reference only

Kept as behavioral reference (SPEC source); it is NOT built or installed anymore.
See [`mda_flutter/README.md`](mda_flutter/README.md) for Flutter-specific setup and `mda_flutter/SPEC_1TO1.md` for the behavioral contract.

## License

Private — not yet licensed for public distribution.
