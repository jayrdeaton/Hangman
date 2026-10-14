# Hangman

The classic word-guessing game: 19,700 puzzles across 58 packs, hand-drawn art, and Pass & Play with friends.

Hangman is an ad-free word-guessing game for iOS, Android, and web. Built with Expo, React Native, React Native SVG, and Reanimated, it's part of a family of games built on my open-source `@tastic` game-engine and `@rific` Expo utility packages. App Store and Google Play release in progress.

<!-- TODO: add gameplay GIF/screenshot here -->

## Features

- **Straight into a puzzle:** the app opens on a random puzzle with no setup screen. Guess letters on the on-screen keyboard (or a physical keyboard on web); six wrong guesses ends the round. Each puzzle shows its difficulty, and Show Hint reveals its pack and, where it has one, a clue.
- **Pass & Play:** one person types a secret word (with an optional hint) and taps Hand Off, the next person taps Ready and guesses, then becomes the next author. There are no scores or player slots, so any number of people can pass the device around. Turning on Keep This Word saves each word to a Pass & Play pack.
- **58 built-in packs, 19,700 puzzles:** grouped under Geography, Sports, Media, Language, Nature, Science, Games, Business, History, Mythology, Transportation, and Other, from Countries and NFL teams to Movies (8,389), TV Shows (4,028), and Songs (1,806).
- **Difficulty:** Any, Easy, Medium, or Hard (6,560, 8,339, and 4,801 puzzles). Random draws favor puzzles you haven't solved yet.
- **Choose Packs and browse:** pick which packs random puzzles come from, or open a pack to see solved answers and blanks for the rest, filter by solved status and difficulty, and tap a puzzle to play it.
- **Custom packs:** create packs of your own words with optional hints, then share them as a `.hangman` file through the share sheet (a download on web). Opening a `.hangman` file from Messages, Mail, Files, or AirDrop offers to import it.
- **Ten art styles:** Classic, Appearing, Disappearing, Robot, Candle, Balloons, Stars, Snowflakes, Hourglass, and Letters Only (no artwork, bigger letters), each previewed with an animated demo in the picker. Switching applies to the round already in progress. A win ends in fireworks.
- **Stats and achievements:** solo stats (wins, losses, win %, current and best streak, letters guessed and correct), separate Pass & Play stats, unlock progress per pack and overall, and 24 achievements for win streaks, solve milestones up to 20,000, flawless and no-hint wins, completing a pack, winning in every art style, creating packs, and Pass & Play games.
- **Progress backup:** Export Progress writes your unlocked puzzles to a `.hangman` file, Import Progress merges one back in, and Reset All Progress starts over. Leaving a puzzle after you've made a guess asks first and counts as a loss.
- **Customize:** theme color and color harmony, System, Light, or Dark appearance, a QWERTY or ABC keyboard layout, and Vibrate On Tap and Sound Effects toggles. Tapping the Hangman title in the menu checks for an update.

## Under the hood

- **One screen, stacked drawers:** there's no router. `App.tsx` renders the providers and `Main`, which owns the current session and remounts `Game` with a fresh key each round so no state leaks between puzzles. Everything else (the menu, Choose Packs, the pack browser and editor, Achievements, Customize) is a `@rific/drawer` panel with a fixed stacking tier (`src/constants/drawerStacking.ts`).
- **Hand-drawn rendering:** letters are drawn stroke by stroke from baked-in Hershey Roman Simplex font data, and every art style is a `GameMode` (`src/modes/`) whose artwork is a react-native-svg component in a fixed 100x100 viewBox, animated on with Reanimated. The screen fades in once as a whole after the puzzle stage and keyboard are laid out, rather than piece by piece.
- **Mode registry:** `ALL_MODES` holds 17 modes, and `VISIBLE_MODES` drops the seven marked `hidden`. Hidden modes still resolve from links and old progress, and Mode Master only requires wins in the visible ones. Every mode allows six wrong guesses, and the limit is frozen at round start.
- **Puzzle selection:** `resolvePuzzle` picks a random pack from the current selection that has the chosen difficulty, then an unsolved puzzle from it, falling back to solved ones once a pack is complete. Answers are normalized at runtime, folding accents (Café becomes CAFE) so every letter is on the A-Z keyboard. Custom words get a difficulty tier from a heuristic based on letters absent from the answer and its length.
- **Persistence:** Redux Toolkit with redux-persist covers only the theme, haptic, and sound settings. Unlocks, achievement stats, and custom packs are each one versioned JSON blob in AsyncStorage (`puzzle_unlocks_v1`, `achievements_v1`, `custom_packs_v1`), and small context providers save keyboard layout, pack selection, and the last mode and difficulty. `@rific/splash-gate` keeps the splash screen up until the theme, fonts, and those saved preferences have loaded.
- **Files and links:** `app.json` registers the `.hangman` file type (an iOS document type and UTI, an Android intent filter). One format carries either a pack or a progress backup, told apart by content, and an incoming file is previewed and only imported after confirmation. A `hangman://play?phrase=...&hint=...&mode=...` link opens straight into that puzzle, with the phrase and hint checked against the same length limits as the input fields.
- **Platform details:** the `@tastic/core` config plugin owns the native portrait lock. On web the game column is capped at 480px wide, and file sharing falls back to a browser download. Over-the-air updates ship through `expo-updates` and `@rific/updater`.
- **Tests:** 30 Jest suites with 392 tests covering the main screen and abandon flow, Pass & Play, the game screen and keyboard, every drawer, the win celebration, achievements, unlock tracking, custom packs, `.hangman` file handling, shared links, and the puzzle picker. CI runs `npm run verify` on pushes and pull requests to `main`.

## Built on

| Package | Used for |
| --- | --- |
| [`@tastic/core`](https://github.com/jayrdeaton/React-Native-Game-Core) | Expo config plugin for the native portrait lock |
| [`@tastic/animations`](https://www.npmjs.com/package/@tastic/animations) | SVG fireworks burst on a win (the `./fireworks` subpath) |
| [`@rific/core`](https://www.npmjs.com/package/@rific/core) | Shared foundation that `@tastic/core` and most of the `@rific` packages here depend on (not imported directly) |
| [`@rific/auto-paper`](https://www.npmjs.com/package/@rific/auto-paper) | React Native Paper theming from a seed color and harmony, light/dark appearance, the color picker, dialogs and menus |
| [`@rific/drawer`](https://www.npmjs.com/package/@rific/drawer) | The menu and every drawer stacked on top of it |
| [`@rific/feedback-press`](https://www.npmjs.com/package/@rific/feedback-press) | Buttons, switches, and keyboard keys with haptic and sound feedback, game sounds, haptic and sound settings |
| [`@rific/scroll-view`](https://www.npmjs.com/package/@rific/scroll-view) | Blurred floating headers and footers in each drawer |
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
  components/   game screen, on-screen keyboard, menu and drawers, dialogs, providers
  constants/    drawer stacking order, release (OTA) version
  data/         generated puzzle packs and catalog (see Puzzle content)
  effects/      win celebration
  hooks/        sound effects, saved preferences, difficulty colors
  modes/        react-native-svg art styles and the shared sketch primitives they're drawn with
  redux/        store with persisted theme, haptic, and sound settings
  types/        shared TypeScript types (Puzzle, GameMode, game session)
  utils/        puzzle picker and catalog, normalization, unlocks, achievements, custom packs, .hangman files, links
  __tests__/    Jest suites
  __mocks__/    manual mocks for native and Expo modules
```

## License

The code is released under the MIT License, see [LICENSE](LICENSE).

The game's name, logo, and icons, and the original artwork and audio in this repository, are not covered by that license and remain all rights reserved. If you fork it, please give your version its own name and look.
