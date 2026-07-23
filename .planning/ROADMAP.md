# Roadmap: Hangman v1.0

**Recommended release order: SECOND** — small surface, but the icon, content-audit, and zero-tests gaps need real work before beta.

## Phase 1 — Identity & Blockers (SHIP-01, SHIP-02)

Icon + monetization decision first: both gate everything store-facing. Exit: icon renders on device, price/free decision recorded here.

## Phase 2 — Content & Code Hygiene (SHIP-03, SHIP-04, POL-01, POL-02)

Dataset audit (rights posture + content pass), TODO resolution, the 5 lint errors, and a minimal game-logic test suite. Exit: lint clean, tests exist and pass, dataset stance documented for review notes.

## Phase 3 — QA & Feel (SHIP-05, POL-03, POL-04)

Full mode matrix on device, interruption/restore, game-feel pass. Exit: matrix documented and passing.

## Phase 4 — Store Readiness (STORE-01..04)

Listing (copy reflects the SHIP-02 decision), screenshots, privacy, age rating. `eas build` + TestFlight. Exit: build in TestFlight.

## Phase 5 — Beta → Submission

TestFlight bake (the game-mode matrix is the thing testers actually exercise), then submit. Exit: released.

## Post-1.0

- Android phase
- Tip jar (if SHIP-02 chose free)
- MMKV storage engine swap (see PLAN.md — roll out here first, then Lumber/CashierFu)
- Daily puzzle / streaks concept (new scoping doc required)
