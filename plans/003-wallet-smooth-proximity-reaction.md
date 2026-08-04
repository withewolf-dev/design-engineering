# 003 — Smooth the wallet's proximity reaction

**Commit:** 35294c2
**File:** `WalletInsert.tsx`
**Symptom:** the wallet's dip reads as jittery/stepped while a card is dragged toward it.

## Cause

`onPanResponderMove` assigns `y.value` from the **JS thread** — PanResponder has no
worklet path, so the value arrives in irregular bursts rather than once per frame.
`p` derives from `y`, and `walletStyle` reads `p` raw. The card doesn't show the
stepping because it's pinned under the finger and the eye tracks the finger; the
wallet has no such cover, so every JS hiccup is a visible jump in the leather.

Two amplifiers:

- `shadowRadius` is animated per frame. On iOS this re-blurs the shadow off-screen
  every frame, on the element that moves most.
- The reaction curve is a bell peaking at `p = 0.82`, so it reverses direction
  inside the last 18% of travel — 2–3 frames' worth of samples.

## Fix

### 1. Spring follower for the reaction (the actual fix)

Do not read `p` in the wallet's style. Insert a follower between them:

```ts
// re-targeted continuously; Reanimated keeps the spring's velocity across
// re-targets, so this integrates on the UI thread every frame regardless of
// how irregularly the JS thread delivers the underlying value
const react = useDerivedValue(() =>
  withSpring(interpolate(p.value, [0.35, 0.8, 1], [0, 1, 0], 'clamp'), {
    dampingRatio: 1,
    duration: 420,
  }),
);
```

`walletStyle` then reads `react.value` instead of `p.value`. `dampingRatio: 1` —
leather gives and settles, it does not bounce.

### 2. Freeze the shadow's blur radius

```ts
shadowOpacity: 0.25 + 0.35 * grab.value,   // keep
shadowRadius: 20,                          // was 12 + 16 * grab.value — move to a
                                           // static style, off the animated path
```

### 3. Widen the bell

`[0.4, 0.82, 1]` → `[0.35, 0.8, 1]`, so the reversal has more travel to happen over.

## Scope boundary

Do not touch the drag mapping, the commit threshold, the haptics, or the assets.
`grab` and `recoil` are already springs and are fine.

## Verification

- `npx tsc --noEmit`
- On device: drag slowly and stop mid-approach — the wallet should ease to its dip
  and hold, not step. Flick from the bottom — the dip and recovery should read as
  one continuous motion.
- Reduced motion on: wallet must not move at all.
