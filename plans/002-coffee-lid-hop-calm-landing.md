# 002 — Taller lid hop, decisive non-bouncy landing

- **Status**: SUPERSEDED — implemented directly in conversation with
  different final values than this plan specifies. The requester refined the
  ask after this plan was written: rise should be a normal, unhurried pace
  (not the fast ~110ms this plan kept), and the fall should read as clearly
  slower/calmer than the rise, not just non-bouncy. Live code now uses
  `withTiming(-LID_JUMP, { duration: 170, easing: EASE_OUT })` then
  `withTiming(0, { duration: 240, easing: EASE_OUT })` — `LID_JUMP` was left
  at `20` (height wasn't part of the follow-up ask). Do not execute this
  plan's 110/160ms target; it would regress the current, correct behavior.
- **Commit**: c289786
- **Severity**: MEDIUM
- **Category**: Physicality & origin (landing feel), Easing & duration
- **Estimated scope**: 1 file, ~3 line changes

## Problem

`CoffeeOrder.tsx` animates the coffee lid with a small "hop" whenever the
selected size changes (the cup's `heightScale` prop changes), simulating the
lid getting jostled loose and resettling. The rise is fine. The fall/landing
is where the requester ("make it hop a little more, and don't give it a
bouncing effect — it needs a calm effect so it sits on it properly, with the
bouncing effect it comes off the alignment") is not getting what they want,
for two compounding reasons:

1. **Amplitude is too small to read as a deliberate hop.** `LID_JUMP = 20`
   (render px) against a lid box roughly 96–110px tall (`CUP_SIZE * LID_SCALE
   * ASSET_ASPECT`, i.e. `190 * 0.58 * (761/866)`) is only ~19–21% of the
   lid's own height — subtle enough to be missed.

2. **The landing curve is not actually calm.** The current code (already a
   plain `withTiming`, not a `withSpring` — an earlier iteration's overshoot
   was already removed) still uses `EASE_IN_OUT` for the fall:

   ```tsx
   // CoffeeOrder.tsx:84-85 — current
   const LID_DROP = 30; // how far above rest the lid starts before it settles
   const LID_JUMP = 20; // how high the lid hops when the size changes underneath it
   ```

   ```tsx
   // CoffeeOrder.tsx:269-286 — current
   useEffect(() => {
     hScale.value = reduced ? heightScale : withSpring(heightScale, POS_SPRING);
     // the resize itself gives the lid a little life: a quick hop up, then a
     // clean fall straight back onto the (already correctly-seated) rest
     // position — as if the resize jostled it loose for a beat. No spring on
     // the landing: it drops and stops, it doesn't wobble. Skipped on this
     // slot's very first render (mount has its own reveal) and under reduced
     // motion (a jolt is exactly the kind of motion that setting exists to
     // remove).
     if (primed.value && !reduced) {
       lidY.value = withSequence(
         withTiming(-LID_JUMP, { duration: 110, easing: EASE_OUT }),
         withTiming(0, { duration: 150, easing: EASE_IN_OUT }),
       );
     }
     primed.value = true;
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [heightScale]);
   ```

   `EASE_IN_OUT` (`cubic-bezier(0.77, 0, 0.175, 1)`, AUDIT.md §2) is the
   correct curve for something *moving across the screen*, but a landing is
   not that — it's an arrival. `ease-in-out` starts the fall slowly (like
   `ease-in` does), which reads as a soft, cushioned settle rather than a
   decisive stop. That soft-settle character is almost certainly what's
   being perceived as "bouncy" / "off the alignment" here, even though there
   is no literal overshoot in the current code — the requester is describing
   the *feel*, and a slow-starting fall that eases into its stop can read as
   wobble-adjacent even without one.

   Note: `hScale` (the cup body's own height, same effect, line 270) still
   animates via `withSpring(heightScale, POS_SPRING)` where
   `POS_SPRING = { damping: 16, stiffness: 200 }` (line 192) — this IS
   underdamped and does overshoot. However the cup scales with
   `transformOrigin: 'top'` (confirmed at the `cupStyle` definition), which
   pins the rim exactly in place regardless of how the height spring
   behaves — so this overshoot cannot be the source of the perceived
   misalignment. It is left untouched by this plan; do not "fix" it.

## Target

```tsx
// CoffeeOrder.tsx:84-85 — target
const LID_DROP = 30; // how far above rest the lid starts before it settles
const LID_JUMP = 28; // how high the lid hops when the size changes underneath it
```

```tsx
// CoffeeOrder.tsx:269-286 — target
useEffect(() => {
  hScale.value = reduced ? heightScale : withSpring(heightScale, POS_SPRING);
  // the resize itself gives the lid a little life: a quick hop up, then a
  // decisive fall straight back onto the (already correctly-seated) rest
  // position — as if the resize jostled it loose for a beat. Both phases use
  // EASE_OUT specifically: a fall that starts fast and plants hard reads as
  // a controlled landing, not a soft, cushioned (bounce-adjacent) settle.
  // Skipped on this slot's very first render (mount has its own reveal) and
  // under reduced motion (a jolt is exactly the kind of motion that setting
  // exists to remove).
  if (primed.value && !reduced) {
    lidY.value = withSequence(
      withTiming(-LID_JUMP, { duration: 110, easing: EASE_OUT }),
      withTiming(0, { duration: 160, easing: EASE_OUT }),
    );
  }
  primed.value = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [heightScale]);
```

Only three values change: `LID_JUMP` (20 → 28), the fall's easing
(`EASE_IN_OUT` → `EASE_OUT`), and the fall's duration (150ms → 160ms).

## Repo conventions to follow

- `EASE_OUT` is already defined at `CoffeeOrder.tsx:44` as
  `Easing.bezier(0.23, 1, 0.32, 1)` — use that existing constant, do not
  define a new one.
- This exact rise/fall duration split (110ms in, 160ms out, both `EASE_OUT`)
  is already the file's own convention for a decisive press-and-release: see
  `PressScale` at `CoffeeOrder.tsx:100-109`:
  ```tsx
  onPressIn={() => {
    s.value = withTiming(scaleTo, { duration: 110, easing: EASE_OUT });
  }}
  onPressOut={() => {
    s.value = withTiming(1, { duration: 160, easing: EASE_OUT });
  }}
  ```
  The lid hop should imitate this precisely — same numbers, same curve —
  rather than inventing a new timing relationship. `EASE_IN_OUT` has no
  precedent for a settle/arrival in this file; `EASE_OUT` on both phases
  does.

## Steps

1. In `CoffeeOrder.tsx`, change `const LID_JUMP = 20;` to
   `const LID_JUMP = 28;` (line 85). Update the trailing comment only if it
   no longer reads naturally — the existing comment text is still accurate
   and may be left as-is.
2. In the `heightScale` effect (~lines 269-286), change the second
   `withTiming` call from
   `withTiming(0, { duration: 150, easing: EASE_IN_OUT })` to
   `withTiming(0, { duration: 160, easing: EASE_OUT })`.
3. Update the comment directly above the `if (primed.value && !reduced)`
   block to explain the EASE_OUT-on-both-phases choice (see Target code
   above for the exact replacement comment) — this is load-bearing context
   for the next person who touches this file, not decoration.
4. Do not change `LID_DROP`, the rise duration/easing (110ms/`EASE_OUT`),
   `POS_SPRING`, or anything in the `hScale` line — none of those are
   implicated by this finding.

## Boundaries

- Do NOT touch `hScale` / `POS_SPRING` / the cup body's own scale animation.
  The recon above confirms `transformOrigin: 'top'` already prevents any rim
  misalignment from that spring; changing it is out of scope and unrelated
  to the reported feel.
- Do NOT touch the `dropLid` mount-reveal effect (the separate `useEffect`
  with `[]` deps that animates the front cup's very first lid drop). That is
  a different animation with a different purpose (first-impression reveal,
  not a size-change reaction) and was not reported as a problem.
- Do NOT touch `LID_SCALE`, `LID_OFFSET_X_FRAC`, `LID_OFFSET_Y_FRAC`, or any
  other calibration constant — those position the lid's *rest* state and are
  unrelated to the hop's motion curve.
- Do NOT change `styles.stage.height` or `CLUSTER_LIFT` — increasing
  `LID_JUMP` from 20 to 28 does not require re-checking the stage clearance
  math from the HEIGHT_SCALE work (that math bounds the cup's height
  *stretch* overflow, not the lid's independent hop, and the lid hop is a
  translateY on a small absolutely-positioned box already comfortably inside
  the stage).
- If the current code at `CoffeeOrder.tsx:84-286` doesn't match the "current"
  excerpts above (i.e. it's drifted since commit `c289786`), STOP and report
  the mismatch instead of improvising a fix.

## Verification

- **Mechanical**: `npx tsc --noEmit` from the project root — expect no
  errors (this change touches only two numeric literals, one identifier
  swap, and a comment; there is no type-shape change).
- **Feel check** (feel cannot be fully judged from code — this is the actual
  point of the change, so this step is not optional):
  1. Run the app, open the Coffee Order screen (gallery → "Coffee Order —
     Caffè Latte" → Open screen, or tap the preview tile).
  2. Tap through Small → Medium → Large → Extra Large a few times.
  3. Confirm the lid visibly hops higher than before (28px vs the prior
     20px, at `CUP_SIZE = 190` render width — should read as a clear,
     deliberate hop, not a subtle jostle).
  4. Confirm the *landing* reads as a decisive plant: fast into the stop,
     no lingering soft settle, and — the actual bar the requester set — no
     sense that the lid dips below or overshoots its resting position
     before settling. It should look like it lands once and stops.
  5. In Xcode/Chrome dev tools (if inspecting via web) or by eye at slow
     phone-shake speed, confirm there is exactly one motion phase down (no
     secondary micro-bounce).
  6. Toggle iOS Settings → Accessibility → Motion → Reduce Motion, reopen
     the screen, change sizes again: confirm the hop is fully suppressed
     (the existing `!reduced` guard) and only the cup's height changes.
- **Done when**: the lid's size-change hop is visibly taller than the
  previous build, the landing has no bounce-adjacent softness (both phases
  share the same decisive `EASE_OUT` character as the app's existing
  press-feedback convention), and reduced-motion users see no hop at all.
