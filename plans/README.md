# Animation plans

Plans produced by the `improve-animations` skill. Each is fully self-contained —
see the individual file for problem, target code, and a feel-check verification
section before executing.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| [001](001-decouple-press-from-react-render.md) | Decouple button presses from React re-renders in CoachTaskCard | HIGH | **DONE** (verified against current code — `CoachTaskCard.tsx` no longer has `useState<Phase>`/`setPhase`; phase is driven entirely by `fromP`/`toP`/`tp` shared values, as the plan specified) |
| [002](002-coffee-lid-hop-calm-landing.md) | Taller lid hop, decisive non-bouncy landing | MEDIUM | **SUPERSEDED** — implemented directly with different values (170ms rise / 240ms fall, both `EASE_OUT`) after the ask evolved; do not execute |

## Execution order

No dependency between 001 and 002 — different files, different components.
002 can run any time.

## Notes

- 001's on-disk status line still reads `TODO`; that's the plan file itself,
  written before the fix landed. The table above reflects an actual code
  check (recon'd while writing plan 002), not the file's own header. Run
  `improve-animations reconcile` to refresh 001's header and retire it
  properly rather than leaving the mismatch.
- 002 was requested directly (`plan <description>`), not surfaced by a full
  audit — no broader audit has been run against this repo yet. A bare
  `improve-animations` invocation would give fuller coverage.
