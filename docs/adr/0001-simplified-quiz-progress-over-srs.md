# 1. Simplified Quiz Progress Tracking Over Spaced Repetition

Date: 2026-10-27

## Context

The initial prototype included a partial Spaced Repetition (SRS) Leitner/SuperMemo calculation inside `App.tsx` and an `srs_cards` table in SQLite (`user_state.sqlite3`). This created three uncoordinated state stores (`taseel_user_state_v1`, `taseel_quiz_answered_v1`, and SQLite `user_db`), complex interval multiplication math leaking across the root UI components, and state desynchronization on untoggle/reset.

## Decision

We gutted the Spaced Repetition (SRS) scheduling algorithms, intervals, and `srs_cards` table. Progress is tracked strictly through:
1. Canonical `quiz_attempts` records (fatwa ID, principle ID, selected choice, correctness, timestamp, duration).
2. Saved `bookmarks`.
3. An unanswered-prioritizing pseudorandom rotation (`pickRandomQuizQuestion`) to deliver varied questions on each session without rigid scheduling constraints.

## Consequences

- Deletes the `srs_cards` table and removes `SpacedRepetitionRecord` types.
- Eliminates interval scheduling logic from the UI layer.
- Establishes a single authoritative persistence store in SQLite with localStorage as an internal fallback adapter.
- Future reviews should not re-introduce SuperMemo/Leitner intervals unless an explicit product requirement for spaced card scheduling is approved.
