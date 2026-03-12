---
description: Mobile App UX/UI Audit - Systematically reviews the app for usability, performance, and design issues
---

# App Audit Skill

When asked to audit this mobile app, follow this structured checklist:

## 1. Visual Consistency Audit
- [ ] All screens use the same color palette and typography scale.
- [ ] Button styles are consistent (same border-radius, padding, font-weight).
- [ ] Icon sizes are uniform across the app.
- [ ] Spacing between elements follows a consistent rhythm (8px grid system).
- [ ] No orphaned or misaligned text/elements.

## 2. Touch & Interaction Audit
- [ ] All interactive elements have a minimum 44x44px touch target.
- [ ] Buttons provide visual press feedback (`activeOpacity` or color change).
- [ ] Swipe gestures are discoverable (visual hints like drag handles).
- [ ] No dead zones where tapping does nothing unexpectedly.
- [ ] Modals can be dismissed by tapping the backdrop.

## 3. Navigation Audit
- [ ] User can always navigate back (no dead-end screens).
- [ ] Current screen/state is visually indicated.
- [ ] Transitions between screens are smooth (no jarring jumps).
- [ ] Deep navigation states don't confuse the user.

## 4. Performance Audit
- [ ] No unnecessary re-renders (check with React DevTools Profiler).
- [ ] Large lists use `FlatList` with proper `keyExtractor`.
- [ ] Images are optimized and lazy-loaded.
- [ ] Animations run on the UI thread (use `useNativeDriver: true`).
- [ ] App startup time is acceptable (< 2 seconds to interactive).

## 5. Accessibility Audit
- [ ] All images have `accessibilityLabel`.
- [ ] Interactive elements have `accessibilityRole` (button, link, etc.).
- [ ] Color contrast ratios meet WCAG AA (4.5:1 for text, 3:1 for large text).
- [ ] App is usable with system font scaling enabled.
- [ ] Screen reader can navigate all elements.

## 6. Error Handling Audit
- [ ] Empty states have helpful messages (not blank screens).
- [ ] Network errors are gracefully handled with retry options.
- [ ] Invalid input shows clear error messages near the field.
- [ ] App doesn't crash on unexpected data (null checks everywhere).

## 7. Platform Parity Audit
- [ ] Test on both iOS and Android for rendering differences.
- [ ] `overflow: 'hidden'` applied where `borderRadius` clips children (Android).
- [ ] `elevation` set for Android shadows, `shadow*` props for iOS.
- [ ] Keyboard behavior tested (`KeyboardAvoidingView`, `behavior` prop differs per OS).
- [ ] Status bar styling is correct on both platforms.

## 8. Security Audit (for this app)
- [ ] Sensitive text is never rendered in the DOM when locked.
- [ ] PIN is stored securely (AsyncStorage is acceptable for local-only apps).
- [ ] Auto-lock timeout works reliably.
- [ ] Biometric fallback to PIN is seamless.

## Output Format
After auditing, create a report with:
1. **Critical Issues** (blocks user flow or causes crashes)
2. **Major Issues** (significant UX problems)
3. **Minor Issues** (cosmetic or nice-to-have improvements)
4. **Recommendations** (enhancements for future versions)
