---
description: UX Polish & Micro-interactions - Elevates apps from functional to premium-feeling
---

# UX Polish Skill

When asked to polish or improve the UX of this app, apply these principles:

## Micro-Interactions
- **Button press**: Subtle scale-down on press (`transform: [{ scale: 0.97 }]`).
- **State transitions**: Fade elements in/out instead of hard show/hide. Use `Animated.timing` with 200-300ms.
- **Loading states**: Always show activity indicators. Never leave the user staring at a blank screen.
- **Success feedback**: Brief haptic pulse (use `expo-haptics`) or green flash on save actions.

## Modal Best Practices
- Modals slide up from the bottom on mobile (native iOS pattern).
- Include a visible drag handle (small rounded pill bar at top).
- Allow dismissal by: swiping down, tapping backdrop, AND a close button.
- Content inside modals should never exceed 90% screen height.
- Use `KeyboardAvoidingView` inside modals with text inputs.

## List & Card Design
- Cards should have subtle borders (`borderWidth: 1, borderColor: '#222'`).
- Add micro-spacing between cards (12-15px margin-bottom).
- Preview text in cards: max 2-3 lines with `numberOfLines` prop.
- Use skeleton loaders instead of spinners for list loading states.

## Empty States
- Never show a blank screen. Always provide:
  - An icon or illustration.
  - A short, friendly message.
  - A CTA button to take the next action.
- Example: "No notes yet. Start a writing session to fill your library!"

## Text & Content
- Use sentence case for buttons and labels (not ALL CAPS except for extreme emphasis).
- Keep button labels to 1-3 words maximum.
- Error messages should be specific: "PIN must be 4 digits" not "Invalid input".
- Use emoji sparingly — max 1 per label, and only for functional meaning (🔒, 🔥, ✓).

## Color Psychology
- **Red** (#ff4d4d): Danger, urgency, deletion, active timer.
- **Green** (#28a745): Success, save, unlock, positive action.
- **Gray** (#888): Neutral, secondary info, disabled states.
- **White/Light** (#F3F4F6): Primary text on dark backgrounds.

## Scroll Behavior
- Always hide scroll indicators for horizontal lists (`showsHorizontalScrollIndicator={false}`).
- Show scroll indicators for long vertical content (helps user gauge position).
- Use `contentContainerStyle={{ paddingBottom: 60 }}` to prevent content hiding behind fixed elements.

## Responsive Design
- Never hard-code pixel widths for full-width elements — use percentages or `flex`.
- Test layouts at 320px width (iPhone SE) and 428px width (iPhone 14 Pro Max).
- Consider landscape mode for tablet users (or lock to portrait if intentional).

## Testing Checklist
- [ ] Every interactive element responds to touch.
- [ ] No text is cut off or overlapping.
- [ ] All modals open AND close correctly.
- [ ] Keyboard doesn't hide input fields.
- [ ] App works with system dark mode enabled.
