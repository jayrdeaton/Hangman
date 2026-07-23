# Requirements: Hangman v1.0 Release

**Defined:** 2026-07-17
**Core value:** The hangman you remember, ad-free — pick a category, pick a mode, play instantly offline.

## v1 Requirements

### Ship Blockers

- [ ] SHIP-01 — **App icon** designed and configured in app.json (currently missing entirely); splash consistency check
- [ ] SHIP-02 — Monetization decision executed: paid-up-front price set OR free (tip jar deferred post-1.0); store listing copy depends on this
- [ ] SHIP-03 — Puzzle data audit: scraped datasets (Jeopardy, bands, movies, TV...) reviewed for content rights posture and offensive/broken entries; document the sourcing stance for App Review
- [ ] SHIP-04 — Resolve 3 source TODOs or explicitly defer them
- [ ] SHIP-05 — Full-device QA: all 7 modes × win/lose paths, category selection, mid-game interruption (backgrounding), state restore via redux-persist

### Polish

- [ ] POL-01 — Fix 5 lint errors (setState-in-effect react-compiler findings) — real render-loop risks in game components
- [ ] POL-02 — Smoke test suite: at least game-logic tests (word selection, guess evaluation, win/lose detection) — currently zero tests; add `--passWithNoTests` interim or real tests (prefer real)
- [ ] POL-03 — Game feel pass: haptics on guess/win/lose, mode animations at 60fps on device
- [ ] POL-04 — Dark/light appearance verified across all 7 modes

### Store Readiness

- [ ] STORE-01 — Listing: name ("Ad-Free Hangman"), subtitle, description leaning on the no-ads/offline angle, category (Games > Word)
- [ ] STORE-02 — Screenshots showcasing 3-4 distinct modes
- [ ] STORE-03 — Privacy label: no data collection at all (strong listing point — say it in the description)
- [ ] STORE-04 — Age rating questionnaire (word content from scraped datasets — align with SHIP-03)

## Out of Scope (v1)

- Android — post-1.0
- MMKV storage swap (existing PLAN.md item — explicitly deferred, not urgent)
- Multiplayer / daily-puzzle notions
- New scraper categories
