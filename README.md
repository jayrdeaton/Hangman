# Hangman

The classic word-guessing game: 19,700 puzzles across 58 packs, hand-drawn art, and Pass & Play with friends.

Hangman is an ad-free word-guessing game for iOS, Android, and web. Built with Expo, React Native, React Native SVG, and Reanimated, it's part of a family of games built on my open-source `@tastic` game-engine and `@rific` Expo utility packages. App Store and Google Play release in progress.

<!-- TODO: add gameplay GIF/screenshot here -->

## Features

- **Home, then play:** the title screen offers Single Player and Pass & Play, each with its own setup page, like the other Tastic games. Single Player's is short: swipe through the art styles, pick a difficulty, choose your packs and player, then Ready. Guess letters on the on-screen keyboard (or a physical keyboard on web); six wrong guesses ends the round. Each puzzle shows its difficulty, and Show Hint reveals its pack and, where it has one, a clue.
- **Picks up where you left off:** the board is saved on every guess. Close the app mid-puzzle and it opens straight back into that puzzle, letters and all (Pass & Play too). Leave a puzzle for the setup page and Ready picks it back up.
- **Pass & Play:** two to eight players (rename them, add more) pass the device around. Whoever just guessed writes the next secret word (with an optional hint), the game suggests who guesses it (whoever has guessed the fewest, and the writer can pick someone else), and that player taps Ready and guesses. The standings track every player's solve rate, and End Session names the winner (the best rate), or a tie. Turning on Keep Each Word saves each word to a Pass & Play pack.
- **58 built-in packs, 19,700 puzzles:** grouped under Geography, Sports, Media, Language, Nature, Science, Games, Business, History, Mythology, Transportation, and Other, from Countries and NFL teams to Movies (8,389), TV Shows (4,028), and Songs (1,806).
- **Difficulty:** Any, Easy, Medium, or Hard (6,560, 8,339, and 4,801 puzzles). New puzzles favor ones you haven't solved yet.
- **Choose Packs and browse:** the setup page's packs card says which packs you're playing ("All 58 packs", or "12 of 58 packs" and their names). Choose Packs picks them (with an All / Selected view to review a trimmed list) and shows every pack's progress, with a trophy once it's complete. Open a pack to see solved answers and blanks for the rest, filter by solved status and difficulty, and tap a puzzle to play it. Play This Pack keeps drawing from just that pack, and Only This Pack narrows the selection to it.
- **Custom packs:** create packs of your own words with optional hints, then share them as a `.hangman` file through the share sheet (a download on web). Opening a `.hangman` file from Messages, Mail, Files, or AirDrop offers to import it.
- **Ten art styles:** Classic, Appearing, Disappearing, Robot, Candle, Balloons, Stars, Snowflakes, Hourglass, and Letters Only (no artwork, bigger letters), picked from a carousel on the Single Player setup page (or a grid in Settings), and the current one acts out a round on the title screen. Switching also applies to a puzzle left waiting. A win ends in fireworks.
- **Stats and achievements:** a Stats & Achievements screen (the Tastic games' shared stats screen) with puzzles unlocked and packs completed, solo stats (played, won, lost, win rate, current and best streak, flawless and no-hint wins, modes won, letters guessed and correct), separate Pass & Play stats, days played, and 34 achievements on the Tastic games' shared bronze, silver and gold ladders: first games, solve milestones up to 2,500, win streaks, flawless and no-hint wins, winning in every art style, completing built-in packs, creating packs, Pass & Play rounds, and days played in a row. Choose Packs shows every pack's progress, selected or not.
- **Progress backup:** Settings' Export writes your unlocked puzzles to a `.hangman` file and Import merges one back in. Reset All Stats, on the stats screen, clears the stats, achievements and unlocked puzzles together. Starting a different puzzle over one you've already guessed in asks first and counts it as a loss.
- **Settings:** Settings (the cog, on every screen) has Sound, Haptics, Keep Awake, System, Light, or Dark appearance (and Blur on iOS and web), the art style, a QWERTY or ABC keyboard layout, the backup, and Check for Updates. The theme color and color harmony are on the setup pages.
- **A whiteboard to play on:** every screen sits on one board, a chalkboard in dark appearance and a whiteboard in light, with the faint smudges of old writing.

## Under the hood

- **Routes:** Expo Router, in `src/app/`: Home (`/`), a setup page per play mode (`/loadout?mode=solo|pnp`), the game (`/game?mode=solo|pnp`), Stats & Achievements (`/achievements`), and `/play` for shared links. Every screen is transparent over one board drawn behind the stack. The game screen remounts `Game` with a fresh key each round so no state leaks between puzzles. Choose Packs, and the pack browser and editor over it, are `@rific/drawer` panels over the Single Player setup page, each with a fixed stacking tier (`src/constants/drawerStacking.ts`).
- **Resume:** the round on the board (and the Pass & Play one, separately) lives in a Redux slice saved under its own key on every guess. The slice also remembers which game screen was open; a cold launch reads that once and Home redirects straight into the game before its menu ever draws.
- **Players:** stats and achievements, unlocked puzzles, the waiting round, colors, art, difficulty and pack selection all belong to a player (every player is the guest until profiles arrive): per-player Redux slices for settings and colors, a per-player key for unlocked puzzles, and stats kept as a device total plus a bucket per profile, the way the other Tastic games keep theirs.
- **Hand-drawn rendering:** letters are drawn stroke by stroke from baked-in Hershey Roman Simplex font data, and every art style is a `GameMode` (`src/modes/`) whose artwork is a react-native-svg component in a fixed 100x100 viewBox, animated on with Reanimated. The screen fades in once as a whole after the puzzle stage and keyboard are laid out, rather than piece by piece.
- **Mode registry:** `ALL_MODES` holds 17 modes, and `VISIBLE_MODES` drops the seven marked `hidden`. Hidden modes still resolve from links and old progress, and Mode Master only requires wins in the visible ones. Every mode allows six wrong guesses, and the limit is frozen at round start.
- **Puzzle selection:** `resolvePuzzle` picks a random pack from the current selection that has the chosen difficulty, then an unsolved puzzle from it, falling back to solved ones once a pack is complete. Answers are normalized at runtime, folding accents (Café becomes CAFE) so every letter is on the A-Z keyboard. Custom words get a difficulty tier from a heuristic based on letters absent from the answer and its length.
- **Persistence:** Redux Toolkit with redux-persist covers the theme, haptic, and sound settings, the stats and achievements (`@tastic/achievements`' slice), and the rounds in progress (their own persist key, so a guess doesn't rewrite the stats). Unlocks and custom packs are each one versioned JSON blob in AsyncStorage (`puzzle_unlocks_v1`, `custom_packs_v1`), and small context providers save keyboard layout, pack selection, and the last mode and difficulty. `@rific/splash-gate` keeps the splash screen up until the theme, fonts, and those saved preferences have loaded.
- **Files and links:** `app.json` registers the `.hangman` file type (an iOS document type and UTI, an Android intent filter). One format carries either a pack or a progress backup, told apart by content, and an incoming file is previewed and only imported after confirmation. A `hangman://play?phrase=...&hint=...&mode=...` link (or `/play?...` on the web) lands on the `/play` route, which opens straight into that puzzle, with the phrase and hint checked against the same length limits as the input fields.
- **Platform details:** the `@tastic/core` config plugin owns the native portrait lock. On web the game column is capped at 480px wide, and file sharing falls back to a browser download. Over-the-air updates ship through `expo-updates` and `@rific/updater`.
- **Tests:** 76 Jest suites with 1,290 tests covering the routes (Home, both setup pages, the game screen, shared links, the root layout), the resume, the per-player data and the saved rounds, Pass & Play sessions, the abandon flow, Pass & Play, the keyboard, every drawer, the win celebration, achievements, unlock tracking, custom packs, `.hangman` file handling, and the puzzle picker. CI runs `npm run verify` on pushes and pull requests to `main`.

## Built on

| Package | Used for |
| --- | --- |
| [`@tastic/core`](https://github.com/jayrdeaton/React-Native-Game-Core) | Expo config plugin for the native portrait lock (its JS only arrives through `@tastic/hud/chrome`) |
| [`@tastic/sprites`](https://www.npmjs.com/package/@tastic/sprites) | SVG fireworks burst on a win (the `./fireworks` subpath) |
| [`@tastic/hud`](https://www.npmjs.com/package/@tastic/hud) | The fleet's shared update card, Settings sheet, confirm cards, result card and Stats & Achievements screen (the light `./chrome` subpath only) |
| [`@tastic/achievements`](https://www.npmjs.com/package/@tastic/achievements) | Stats, the achievements catalog engine and its Redux slice |
| [`@rific/core`](https://www.npmjs.com/package/@rific/core) | The fleet's `safeBack` (back, or Home when there's nothing to go back to), and the shared foundation `@tastic/core` and most of the `@rific` packages here depend on |
| [`@rific/auto-paper`](https://www.npmjs.com/package/@rific/auto-paper) | React Native Paper theming from a seed color and harmony, light/dark appearance, the color picker, dialogs and menus |
| [`@rific/drawer`](https://www.npmjs.com/package/@rific/drawer) | Choose Packs, and the pack browser and editor, stacked over the setup page |
| [`@rific/feedback-press`](https://www.npmjs.com/package/@rific/feedback-press) | Buttons, switches, and keyboard keys with haptic and sound feedback, game sounds, haptic and sound settings |
| [`@rific/scroll-view`](https://www.npmjs.com/package/@rific/scroll-view) | Blurred floating headers and footers on the Pass & Play setup page and in each drawer |
| [`@rific/splash-gate`](https://www.npmjs.com/package/@rific/splash-gate) | Holds the splash screen until the theme, fonts, and saved preferences are ready |
| [`@rific/toaster`](https://www.npmjs.com/package/@rific/toaster) | Toast notifications (achievement unlocks, input warnings) |
| [`@rific/updater`](https://www.npmjs.com/package/@rific/updater) | OTA update checks and the `build`/`update` scripts |
| [`@rific/focus-chain`](https://www.npmjs.com/package/@rific/focus-chain) | Field-to-field focus in the pack editor and the Pass & Play word prompt |

## Getting started

```bash
npm install
npm run ios        # or: npm run android / npm start, then press w for web
```

`npm run ios` and `npm run android` build a native development client (`expo-dev-client`). The app uses native code and config that Expo Go doesn't include (`react-native-keyboard-controller`, the `@tastic/core` config plugin, and the `.hangman` file type registration), so it won't run in Expo Go. Once a dev client is installed, `npm run client` starts Metro for it.

### Checks

```bash
npm run verify     # lint (expo lint) + Jest + typecheck (tsc)
```

## Puzzle content

The built-in packs live in `src/data/`: one JSON file per pack, `puzzleCatalog.generated.ts` (the manifest plus a loader for each pack), and `puzzleManifest.json` (a JSON copy of the manifest that the app doesn't import). They're generated by a private companion repo and copied in as one complete drop-in unit, the `src/data/` directory. Nothing in this repo regenerates them, and ESLint skips `*.generated.ts`.

### Adding a pack without the private repo

You don't need the private repo to add a pack. `Puzzle` (`src/types/puzzle.ts`) is a plain shape:

```ts
type Puzzle = {
  id: string                    // unique within its pack and stable per answer: unlocks
                                // (puzzle_unlocks_v1) are keyed by pack key and this id
  source: PuzzleSource          // 'phrases' | 'trivia' | 'movie' | 'tv' | 'music-band' | ...
  type: 'phrase' | 'trivia' | 'title' | 'band' | 'song'
  answer: string                // display text, and what the played phrase is built from
  normalizedAnswer: string      // uppercase A-Z and spaces only, see below
  category: string
  difficulty: number
  difficultyTier: 'easy' | 'medium' | 'hard'
  wordCount: number
  letterCount: number
  uniqueLetterCount: number
  tags?: string[]
  metadata?: Record<string, unknown>
}
```

The keyboards only have A-Z. The phrase you actually play is built from `answer` at runtime by `normalizePhrase` (`src/utils/normalizePhrase.ts`), which folds accents, drops anything that isn't a letter or space, and uppercases the rest. A puzzle whose answer normalizes to nothing is skipped. The game doesn't read `normalizedAnswer`, but keep it equal to `normalizePhrase(answer)` so the data stays consistent.

The in-game hint comes from a `metadata.hint` string if there is one. Otherwise it's built from `metadata.artist` and `metadata.year`, plus the puzzle's `category` when the pack lists more than one category.

To add a pack by hand:

1. Write `src/data/yourPackName.json` as a plain array of `Puzzle` objects.
2. Add an entry for it to the `puzzleManifest` array in `src/data/puzzleCatalog.generated.ts`: `key`, `file`, `label`, `count`, `difficultyTiers`, `sources`, `categories`, and an optional `group` (the heading it's sorted under, such as Geography). All of them come straight from the array you just wrote. `count` should equal the array's length, since progress is measured against it, and `difficultyTiers` should list every tier in the pack, since the difficulty filter skips packs whose list lacks the chosen tier. Then add a matching loader to that file's `loaders` object, in the same shape as the others (a same-directory require, since the data files and the catalog live together in `src/data/`):

   ```ts
   'yourPackName': () => {
     const mod = require('./yourPackName.json')
     return (mod?.default ?? mod) as Puzzle[]
   }
   ```

3. Run `npm run verify` to confirm nothing's broken.

This is a small enough shape that a short script to automate steps 1 and 2 is easy to write yourself if you're adding several packs. There just isn't a maintained one in this repo, since the canonical version of that logic lives in the private companion repo (which also runs it automatically after every scrape).

## Project layout

```
src/
  app/          Expo Router routes (Home, setup pages, game, stats, shared links) and the root layout
  components/   screens, game board, on-screen keyboard, drawers, dialogs, providers
  constants/    drawer stacking order, release (OTA) version
  data/         generated puzzle packs and catalog (see Puzzle content)
  effects/      win celebration
  hooks/        sound effects, saved preferences, difficulty colors
  modes/        react-native-svg art styles and the shared sketch primitives they're drawn with
  redux/        store with persisted theme, haptic, and sound settings, stats, and the rounds in progress
  types/        shared TypeScript types (Puzzle, GameMode, game session)
  utils/        puzzle picker and catalog, normalization, unlocks, stats engine, custom packs, .hangman files, links
  __tests__/    Jest suites
  __mocks__/    manual mocks for native and Expo modules
```

## License

The code is released under the MIT License, see [LICENSE](LICENSE).

The game's name, logo, and icons, and the original artwork and audio in this repository, are not covered by that license and remain all rights reserved. If you fork it, please give your version its own name and look.
