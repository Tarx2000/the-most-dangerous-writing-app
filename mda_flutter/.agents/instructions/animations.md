# Domain Instruction: Flutter Animations & Visual Motion

## Scope
Any Flutter widget involving `AnimationController`, implicit animations (`AnimatedContainer`, `AnimatedScale`, `AnimatedOpacity`), gestures, GLSL shaders, or `liquid_glass_easy`.

## Aesthetic Standard: Clean & Professional
- Animations must look clean, elegant, and professional rather than playful, hyperactive, or excessively bouncy.
- Use smooth timing curves (`Curves.easeOutCubic`, `Curves.fastOutSlowIn`) or well-damped springs. Avoid excessive overshooting.
- Subtle feedback: Button taps and micro-interactions should use subtle scaling factors (`AnimatedScaleButton` scaling around 0.95–1.03x).

## Liquid Glass Standard & Solid Fallback
- **Standard UI Element**: Liquid glass is the standard treatment for navigation bars (`LiquidGlassNav`), floating pills, modals, and interactive dialogs via `liquid_glass_easy: ^4.3.1` and custom GLSL fragment shaders.
- **Mandatory Solid Fallback**: Liquid glass MUST ALWAYS support a clean, solid translucent fallback (`AppColors.overlayLockAndroid` / solid token) for when the user toggles liquid glass off in settings or on resource-constrained devices.
- **Background**: Screen backgrounds remain pure AMOLED black (`#000000`). Glass effects float above this black canvas.
- **GPU Performance**: Avoid stacking multiple real-time glass shaders over high-frequency scrolling lists (like the feed) to prevent frame drops.

## Animation Performance Rules
- **Repaint Boundaries**: Wrap complex animating subtrees or custom painters in `RepaintBoundary` so that painting the animation does not trigger repaints in the parent tree.
- **Transform Over Layout Reflow**: Animate `Transform.scale` or `Transform.translate` rather than dynamically changing container `width`, `height`, or `padding` during an animation frame. Layout reflow forces expensive re-measurement passes.
- **Isolate Animations from App State**: Use `AnimatedBuilder` with a child widget parameter so only the transform/opacity updates per frame, without rebuilding the child subtree:
```dart
AnimatedBuilder(
  animation: controller,
  builder: (context, child) => Opacity(
    opacity: controller.value,
    child: child,
  ),
  child: const ExpensiveSubtree(), // Built once!
);
```

## Feed Transition & Gestures
- The home feed transition is gesture-driven via a 0.0 to 1.0 reveal progress value.
- Drag frames must only update transforms (`Transform.translate`), not rebuild list items.
- Feed video cards require:
  1. Viewport intersection check (must be visible on screen).
  2. Foreground / current route check (must be the active route).
  3. Reveal progress >= 0.95 before initiating playback.

## Haptic Feedback
- Short tactile interactions (tab changes, buttons) use native `HapticFeedback.lightImpact()` or `HapticFeedback.selectionClick()`, throttled to avoid rapid bursts.
- Longer warning patterns (writing danger countdown) use vibration patterns.
- Toggling haptics off in settings must immediately cancel any active vibration pattern.
