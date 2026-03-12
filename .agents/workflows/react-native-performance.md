---
description: React Native Performance Best Practices — Checklist to follow before committing any UI or state changes
---

# React Native Performance Best Practices

// turbo-all

Follow these rules before writing or reviewing any React Native code in this project. Based on Callstack's "Ultimate Guide to React Native Optimization" and the `react-native-best-practices` skill.

## 1. TextInput Performance

- **Never use `value={state}` on TextInput for freeform text.** Use `defaultValue` (uncontrolled pattern) and store the text in a `useRef`. Read the ref value only when saving or submitting.
- For search/filter inputs where you need live results, prefer `defaultValue` with `onChangeText` updating a ref + debouncing the state update.
- Use `ref.current.clear()` to programmatically clear — not by setting state to `''`.

## 2. Lists & Virtualization

- **Never use `ScrollView` + `.map()` for dynamic lists** with more than ~15 items. Always use `FlatList` or `FlashList` (`@shopify/flash-list`).
- Always provide `keyExtractor` with unique IDs (not array index).
- For FlatList, add performance props: `removeClippedSubviews`, `maxToRenderPerBatch`, `initialNumToRender`, `windowSize`.
- Define `renderItem` outside the component or wrap in `useCallback` to avoid re-creating it on every render.

## 3. Animations

- **Never use `Animated` from `react-native` for visual animations.** Always use `react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSequence`).
- Animations must run on the UI thread — not on the JS thread.
- Keep `useAnimatedStyle` callbacks fast — only read shared values, never do heavy computation.
- Use `Animated.View` from `react-native-reanimated`, not from `react-native`.

## 4. State Management & Re-renders

- **Never use `useState` for values that change at high frequency** (e.g., timer ticks every 100ms, scroll position). Use `useSharedValue` from Reanimated or `useRef` instead.
- Minimize state in parent components. Move rapidly-changing state into the smallest possible child component.
- Use `React.memo()` on components that receive stable props.
- Use `useCallback` and `useMemo` for functions/values passed as props to child components.

## 5. Bundle & Import Hygiene

- **Never use barrel exports** (`export * from './foo'`). Import directly from the source file.
- Check bundle size with `npx react-native bundle` + `source-map-explorer` after adding new dependencies.
- Prefer native SDKs over JS polyfills when available (e.g., Hermes has native `Intl` support).

## 6. Code Review Checklist

Before committing any PR:

1. [ ] No `value={state}` on freeform `TextInput` — use `defaultValue`
2. [ ] No `ScrollView` + `.map()` for dynamic lists — use `FlatList`/`FlashList`
3. [ ] No `Animated` from `react-native` — use `react-native-reanimated`
4. [ ] No `useState` for high-frequency values — use `useSharedValue` or `useRef`
5. [ ] No barrel exports — import directly from source
6. [ ] `renderItem` functions wrapped in `useCallback` or defined outside component
7. [ ] Heavy components wrapped in `React.memo()`
