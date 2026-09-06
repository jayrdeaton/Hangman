# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# Hangman

An ad-free Hangman word-guessing game (Expo/React Native). Part of the `@rific`/`@tastic`/InfiniteToken app ecosystem — depends on `@rific/auto-paper`, `@rific/drawer`, `@rific/feedback-press`, `@rific/focus-chain`, `@rific/scroll-view`, `@rific/splash-gate`, `@rific/toaster`, `@rific/updater`, and `@tastic/animations` (the `./fireworks` subpath only, for the win-celebration burst — see `src/effects/FireworksCelebration.tsx`). Still no Skia dependency — unlike the fleet's Skia-rendered games (BoxHockey, AirHockey, Snake), this app draws its gallows/word-reveal "modes" with `react-native-svg`, and `@tastic/animations/fireworks` is itself SVG-based, so this app never depends on `@shopify/react-native-skia` at all. `@tastic/animations` also has a `./gravity` subpath (Skia-based, used by BoxHockey/Swirlio's gravity-well effect) that this app doesn't import — the package's two subpaths keep each renderer's peer dependency scoped to only the apps that actually use it.

**Expo has changed.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code — don't rely on general Expo knowledge, this app is on SDK 57 specifically.

## Commands

```bash
npm run lint          # expo lint .
npm run fix            # expo lint . --fix
npm test               # Jest (30 suites, 397 tests)
npm run test:watch     # Jest --watchAll
npm run typecheck      # tsc
npm run verify         # lint + test + typecheck
npm run doctor         # expo install --fix && expo-doctor
npm start              # Expo dev server
npm run client          # Expo dev server (dev client build)
```

Always run `npm run lint` before finishing any task. This is an app (`"private": true`, no publish scripts) — `verify` doesn't include a build step.

`build:development`/`build:preview`/`build:production`/`build:web` and `update` (which `update:development`/`update:preview`/`update:production` delegate to) are each gated behind `verify` by prefixing `npm run verify && ` directly onto the script's own definition, same as every other migrated app — see Swirlio's CLAUDE.md for the full reasoning (not redundant with CI, since EAS builds/OTA updates have no GitHub Action step to catch this the way `publish.yml` does; inline chaining rather than a separate `pre<script>` hook, since these are scripts we author ourselves, not builtin npm commands).

## Tooling

Onboarded onto the shared `@infinitetoken` config packages (`eslint-config`, `jest-config`, `tsconfig`) — previously hand-rolled its own `eslint-config-expo`-based config, `jest-expo`-preset-direct config, and `expo/tsconfig.base`-extending tsconfig, the same boilerplate pattern documented in every other migrated app's CLAUDE.md.

`npx expo install --check` + `npx expo install --fix` + `npm update` were run as part of this pass — `expo install --fix` found real staleness (`expo` and `expo-updates` were each a patch behind). Confirmed clean afterward: `npx expo install --check` reports up to date, `npm outdated` shows `Current === Wanted` for every dependency (remaining `Latest` values are all major bumps outside declared ranges — a deliberate-upgrade decision, not routine maintenance).

- `eslint.config.cjs` — `@infinitetoken/eslint-config/expo`, plus one genuine local override: an `ignores: ['**/*.generated.ts']` block, since `src/data/puzzleCatalog.generated.ts` is produced by a private companion scraper repo and copied in as-is ("Do not edit manually" — see its own header comment and README.md) rather than hand-written source. Confirmed this file genuinely exists before keeping the override; nothing else in the old hand-rolled config was a real deviation from the shared preset's boilerplate.
- `tsconfig.json` — `extends: "@infinitetoken/tsconfig/expo"`, keeps the path-valued local bits (`paths`, `include`), plus a real `exclude: [".claude/worktrees"]`. Unlike apps where that entry was dropped because the directory was empty or absent, this repo currently has two real, populated worktree checkouts (`.claude/worktrees/frosty-gates-*`, `.claude/worktrees/funny-lumiere-*`) with 212 of their own `.ts`/`.tsx` files outside `node_modules` — confirmed with `ls`/`find` before keeping the entry, not assumed. No `@shopify/react-native-skia` redirect needed — this app doesn't depend on that package at all.
- `jest.config.cjs` — `@infinitetoken/jest-config/expo`, no options at all — `jest.setup.cjs` and `roots` are both auto-detected/defaulted, and `moduleNameMapper` is auto-derived from `tsconfig.json`'s own `paths`.

**`jest.config.ts` became `jest.config.cjs`** (a `.cjs` file already, actually — this app was already on `jest.config.cjs` pre-migration, one of the few in the fleet not on `.ts`, so there was no `ts-node`/`tsconfig.jest.json` baggage to remove here), **`tsconfig.json`'s `types` array was removed** (now defaulted by the shared preset), **and `prettier.config.js` was deleted** in favor of `"prettier": "@infinitetoken/eslint-config/prettier"` in `package.json` — all for the same reasons documented in BoxHockey's/Swirlio's CLAUDE.md. This app never had a `metro.config.js` at all, so there was nothing to check/delete there.

**Native/Expo module mocks moved from inline `jest.mock()` calls in `jest.setup.cjs` into individual `src/__mocks__/*.ts` files**, ported verbatim from this app's own pre-migration `jest.setup.ts`: `react-native-reanimated`, `react-native-worklets`, `react-native` (the `PermissionsAndroid`/`Linking`/`AppState`/`Vibration`/`Modal` override), `@rific/scroll-view`, `@expo/vector-icons` (+ its `createIconSet`/`createIconSetFromFontello`/`build/createIconSet`/`build/MaterialCommunityIcons` deep imports), `@react-native-async-storage/async-storage`, `expo-audio`, `expo-blur`, `expo-font`, `expo-linking`, `expo-splash-screen`, `react-native-gesture-handler`, `react-native-keyboard-controller`, `react-native-safe-area-context`, `react-native-svg`, `redux-persist` (+ its `integration/react` subpath), and `react-native-paper`'s two `MaterialCommunityIcon` build-path variants (`src/components/...`, `lib/commonjs/src/components/...` — the latter guarded in the original file's own try/catch, since that exact path was never real: there is no `lib/commonjs/src/` directory in the installed version at all). `jest.setup.cjs` now holds only genuine setup-file content: the `IS_REACT_ACT_ENVIRONMENT` flag, `unhandledRejection`/`uncaughtException` handlers, the no-factory `NativeAnimatedHelper` automock, the RAF/cancelAnimationFrame polyfills, this app's own Animated-JS-driver-forcing patch, and its `NativeAnimatedModule.startAnimatingNode` synchronous-callback patch (both pre-existing, app-specific, and neither a `jest.mock()` call, so neither belonged in `src/__mocks__/`).

**A real regression, found and fixed as part of this migration: a manual mock under `src/__mocks__/` for a deep SUBPATH of a node_modules package is not reliably auto-applied the way a bare package-name mock is.** Every mock listed above for a *bare* package (`react-native-reanimated`, `expo-audio`, `redux-persist`, `@rific/scroll-view`, etc.) works with zero registration, matching this package's own documentation. But `2 of 30 suites` (`PackPuzzleList.test.tsx`, `PnpFlow.test.tsx`) started failing after the pure file-extraction pass, both on assertions sensitive to a react-native-paper `<Button icon='...'>`'s rendered text — instead of an empty icon slot, the raw MaterialCommunityIcons font glyph character showed up before the label. Confirmed directly, not guessed: a `console.warn` planted in the real (un-mocked) `@expo/vector-icons/build/MaterialCommunityIcons.js` and in react-native-paper's own compiled `MaterialCommunityIcon.js` fired during a failing test with a same-shaped mock file already sitting under `src/__mocks__/` for both, and did *not* fire once each was registered — and, separately, that `import * as RNPaper from 'react-native-paper'` (ESM, in real app/test code, transformed by `babel-preset-expo`) resolves to `react-native-paper/src/index.tsx`, while a plain `require.resolve('react-native-paper')` call resolves to `lib/commonjs/index.js` instead — two different real files, confirmed by the same technique. This app's own pre-migration `jest.setup.ts` never hit this, because it always registered every one of these subpaths with an explicit `jest.mock(path, factory)` call — the migration only moved the factory *bodies* out, and dropped the registration itself along with them. Fixed by keeping an explicit, no-factory `jest.mock('specifier')` call in `jest.setup.cjs` for every subpath mock (bare-package mocks still need none), so Jest is told to use the adjacent `src/__mocks__/` file rather than relying on auto-discovery. One further gap surfaced in the process and needed a fresh mock, not just a registration: `Theme.tsx` imports `@expo/vector-icons/MaterialCommunityIcons` (no `/build/`) directly to preload the icon font — a real module this app's own original `jest.setup.ts` never mocked either, but registering only the `/build/` subpath wasn't enough to stop *this* import from loading the real font-glyph component. That one is an inline factory in `jest.setup.cjs` rather than its own `src/__mocks__/` file, since a bare registration for it alone didn't reliably pick up an adjacent file either. **Flagged for Jay below** — this likely affects other already-migrated apps with subpath mocks (`redux-persist/integration/react`, `@expo/vector-icons/createIconSet`, etc.) that simply never had a test assertion sensitive enough to catch it.

**Migrating onto `@infinitetoken/tsconfig/expo` turned on `noUnusedLocals` for the first time**, surfacing 19 dead `import React from 'react'` statements (leftover from before the `react-jsx` transform made them unnecessary) across `App.tsx`, `src/__tests__/App.test.tsx`, `src/components/GameVisual.tsx`, `src/components/SketchWord.tsx`, and 15 of the `src/modes/*.tsx` visual-mode files — removed (three of them, `jenga.tsx`/`snowflakes.tsx`/`stars.tsx`, kept their `{ useState }` named import, only the default `React` import was dead). Also one dead reduce-callback parameter, `src/modes/letters.tsx:22`'s `(acc, w, i) =>` — `w` was never read (the running cursor uses `widths[i - 1]` instead) — renamed to `_w` rather than removed, since the used `i` parameter comes after it positionally.

**Migrating onto `typescript-eslint`'s `recommended` ruleset via the shared preset surfaced no new lint errors or warnings** — `npx eslint .` reports 0 problems both before and after the config swap.

`@infinitetoken/eslint-config` (`^0.2.0`), `@infinitetoken/jest-config` (`^0.2.3`), and `@infinitetoken/tsconfig` (`^0.4.1`) are all on real published versions — never yalc-linked for this app.

## Testing

- Framework: Jest (`@infinitetoken/jest-config/expo`, `jest-expo` preset)
- Tests live in `src/__tests__/`, mirroring the source subfolder structure (`components/`, `effects/`, `hooks/`, `utils/`)
- Native/Expo module mocks live in `src/__mocks__/`, one file per module (including several scoped subpaths) — a bare-package mock is picked up automatically, but every subpath mock needs its matching explicit `jest.mock('specifier')` call in `jest.setup.cjs` too (see Tooling above for why)
- `jest.setup.cjs` holds only genuine setup-file concerns: the explicit subpath-mock registrations, process-level error handlers, the RAF/cancelAnimationFrame polyfills, the `IS_REACT_ACT_ENVIRONMENT` flag, the no-factory `NativeAnimatedHelper` automock, and this app's own Animated-JS-driver-forcing + `NativeAnimatedModule` synchronous-callback patches

## Architecture

```
src/
  components/   - UI components (game screen, drawers, dialogs, keyboard, providers)
  constants/    - static config, game params
  data/         - generated puzzle content (puzzleCatalog.generated.ts + JSON), copied in from a
                  private companion repo — see README.md, not hand-edited here
  effects/      - visual/animation effects
  hooks/        - custom hooks (sound, redux-persist bindings, settings)
  modes/        - react-native-svg word-reveal "modes" (classic, candle, flower, jenga, ...),
                  modes/shared/ for primitives shared across them
  redux/        - Redux Toolkit store, slices, persistence
  types/        - shared TypeScript types
  utils/        - puzzle catalog/picker logic, achievements, validation
  __tests__/    - test suites
  __mocks__/    - manual Jest mocks for native/Expo modules
```

## CI

`.github/workflows/ci.yml` uses the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-ci.yml@v1`, defaults to `npm run verify`) — previously a hand-rolled workflow. The `ci` npm script was renamed to `verify` to match.
