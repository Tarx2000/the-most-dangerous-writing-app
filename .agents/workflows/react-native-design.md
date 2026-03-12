---
description: React Native UI Design Best Practices - Creates premium, mobile-first interfaces
---

# React Native Design Skill

When designing or reviewing React Native UI components, follow these rules strictly:

## Color System
- **Primary Palette**: Use curated HSL-based colors, never raw CSS color names.
- **Dark Mode First**: Default to dark backgrounds (`#000`, `#111`, `#1a1a1a`). Light text on dark.
- **Accent Colors**: Use vibrant but purposeful accents. In this project: Danger Red `#ff4d4d`, Success Green `#28a745`.
- **Neutral Scale**: `#222` for cards, `#333` for borders, `#555` for muted borders, `#888` for secondary text, `#aaa` for tertiary.
- **Never use pure white `#fff` for backgrounds** — use `#F3F4F6` or off-whites for text.

## Typography
- Minimum touch-label font size: **14px**.
- Headers: **bold, 20-28px**, with generous letter-spacing for titles.
- Body text: **16-18px**, line-height at least **1.5x** font size.
- Use `Platform.select` for cross-platform font families (San Francisco on iOS, Roboto on Android).

## Layout & Spacing
- **Consistent padding**: Use 15-20px as base padding for containers.
- **Card border-radius**: 12px standard, 20-30px for pill-shaped buttons.
- **Gap property**: Use `gap` in flex containers instead of margins where possible.
- **SafeAreaView**: Always wrap root screens in `SafeAreaView` for notch safety.

## Touch Targets
- **Minimum 44x44px** for all interactive elements (Apple HIG guideline).
- Add invisible padding around small icons: `style={{ padding: 10 }}`.
- Use `TouchableOpacity` with `activeOpacity={0.7}` for subtle press feedback.

## Animations
- Prefer `react-native-reanimated` over `Animated` API for 120fps performance.
- Use `useAnimatedStyle` and `withSpring` / `withTiming` for buttery transitions.
- Keep animation durations between 200-500ms. Never exceed 800ms.
- Use `Easing.out(Easing.ease)` for exit animations, `Easing.inOut` for transitions.

## Shadows & Elevation
- iOS: Use `shadowColor`, `shadowOpacity` (0.1-0.3), `shadowRadius` (8-15), `shadowOffset`.
- Android: Use `elevation: 4-8` for card-level depth.
- Dark mode shadows: Use colored shadows sparingly (e.g. `shadowColor: '#ff4d4d'` on CTA buttons).

## Anti-Patterns to Avoid
- ❌ Inline styles for repeated patterns — use `StyleSheet.create`.
- ❌ Hard-coding `Dimensions.get('window')` everywhere — compute once, pass as prop.
- ❌ Using `ScrollView` for long lists — use `FlatList` with `keyExtractor`.
- ❌ Nesting `TouchableOpacity` inside `ScrollView` without `delaysContentTouches={false}`.
- ❌ Using `flex: 1` without understanding parent constraints.

## Platform Differences
- Always test on both iOS and Android.
- Use `Platform.OS === 'ios'` or `Platform.select({})` for platform-specific styling.
- `borderColor` renders differently on Android — always set `borderWidth` explicitly.
- `overflow: 'hidden'` is required on Android for `borderRadius` to clip children.
