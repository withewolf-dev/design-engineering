# 001 — Decouple button presses from React re-renders in CoachTaskCard

- **Status**: TODO
- **Commit**: ce9906a (working tree, uncommitted)
- **Severity**: HIGH
- **Category**: Performance (+ one Accessibility item)
- **Estimated scope**: 1 file (CoachTaskCard.tsx), ~15 lines

## Problem

The user reports button animations are "very choppy." Root cause: every button
press triggers a full React re-render that collides with the running UI-thread
animations.

```tsx
// CoachTaskCard.tsx:86 — current
const [phase, setPhase] = useState<Phase>('offered');
```

```tsx
// CoachTaskCard.tsx:92-100 — current
const go = (next: Phase) => {
  setPhase(next);                    // ← forces re-render; `phase` is NEVER read in render
  const target = next === 'offered' ? 0 : next === 'active' ? 1 : 2;
  ap.value = withTiming(target, { duration: 240, easing: EASE_OUT });
  ...
};
```

All visible state (rows, kicker, pointerEvents) is driven by the `ap` shared
value. The `setPhase` call only causes a React commit — which re-renders
`SunsetCard`, recreates its `useDerivedValue` uniforms, and rebinds its
continuously-repainting Skia shader mid-crossfade. That JS-thread work is the
chop.

Secondary: `Enter` (CoachTaskCard.tsx:70-76) starts animations inside a
`useState` initializer — a side effect during render.

Tertiary: `checkPop` spring (CoachTaskCard.tsx:96-99) ignores reduced motion.

## Target

- Pressing any button causes **zero React re-renders** — `go()` only writes
  shared values.
- Entrance animations start in `useEffect` after commit.
- Reduced motion: check appears via `withTiming(1, { duration: 150 })` (fade-in
  scale settle, no spring bounce).

## Repo conventions to follow

- Easing token: `EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)` (top of file).
- Spring vocabulary: `{ damping: 14, stiffness: 260 }` (checkPop).
- All animated props flow through shared values + `useAnimatedStyle` worklets.

## Steps

1. `CoachTaskCard.tsx` imports: remove `useState`, add `useEffect`.
2. Delete line 86 (`const [phase, setPhase] = useState<Phase>('offered');`).
3. In `go()`, delete the `setPhase(next);` line. Keep the `Phase` type for the
   parameter.
4. In `Enter`, replace the `useState(() => { ... return null; })` block with:
   ```tsx
   useEffect(() => {
     p.value = withDelay(
       index * STAGGER_MS,
       withTiming(1, { duration: ENTER_MS, easing: EASE_OUT }),
     );
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);
   ```
5. In `go()`, branch the completion pop on `reduced`:
   ```tsx
   if (next === 'done') {
     if (reduced) {
       checkPop.value = withTiming(1, { duration: 150 });
     } else {
       checkPop.value = 0.5;
       checkPop.value = withSpring(1, { damping: 14, stiffness: 260 });
     }
   }
   ```

## Boundaries

- Do NOT touch SunsetCard.tsx, App.tsx, or any other component.
- Do NOT change markup, copy, or styles — behavior wiring only.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit` exits 0.
- **Feel check** (on device): rapidly tap Accept → Mark complete → Done → reset.
  - Press scale (0.97) engages instantly with no hitch.
  - The 240ms row crossfade plays smoothly while the sunset bloom keeps
    breathing behind it.
  - Spamming buttons mid-crossfade retargets smoothly (never restarts from 0).
- **Done when**: no React re-render occurs on press (verify: add a temporary
  `console.count('render')` in the component body — it must not increment on
  taps — then remove it).
