# The Most Dangerous Writing App

A journaling app where if you stop typing, your text is destroyed. This is a **monorepo** containing two implementations of the same app:

| Folder | Implementation | Status |
|---|---|---|
| [`mda_rn/`](mda_rn/) | React Native (Expo SDK 55, React 19, Reanimated 4) | **Source of truth** — the original app |
| [`mda_flutter/`](mda_flutter/) | Flutter (Dart 3.12, Flutter 3.44) | Port — behavioral contract in `mda_flutter/SPEC_1TO1.md` |

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

### React Native (`mda_rn/`)

```bash
cd mda_rn
npm install
npm start           # Start Expo dev server
npm run android     # Run on Android
npm run ios         # Run on iOS
npm test            # Run the test suite
```

Release APK builds: see `.agents/workflows/expo-build.md` (opencode command `/expo-build`).

### Flutter (`mda_flutter/`)

See [`mda_flutter/README.md`](mda_flutter/README.md) for Flutter-specific setup and `mda_flutter/SPEC_1TO1.md` for the behavioral contract.

## License

Private — not yet licensed for public distribution.
