# Plan

## Notes

A ripple effect color change on the winning keypress would be really cool — not super necessary, just a fun idea. The keyboard could have some cool effect on a win since it takes up a good chunk of the screen.

## Swap persistence to MMKV

**Status:** Deferred, not urgent.

**Context:** expo-doctor flags `redux-persist` as unmaintained (no recent
releases). It's not broken — Hangman, Lumber, and CashierFu-Utility all use
the same `@reduxjs/toolkit` + `react-redux` + `redux-persist` stack on top of
`@react-native-async-storage/async-storage`, and it works fine on current
versions. Currently suppressed via `expo.doctor.reactNativeDirectoryCheck.exclude`
in `package.json`.

Asked separately whether this data deserves SQLite instead: no. Nothing here
is relational (no joins, no indexed range queries, no querying across packs)
— it's independent JSON blobs, worst case around 1MB. SQLite would add a
schema/migrations/query-layer for data that's fundamentally just
`JSON.parse(await AsyncStorage.getItem(key))`.

**Idea:** Swap the underlying storage engine from AsyncStorage to
`react-native-mmkv` (synchronous, significantly faster). redux-persist
supports a custom storage adapter, so the `theme`/`haptic` slices (haptics
joined the same redux-persist whitelist as theme once the Settings drawer's
vibrate toggle landed — see `@/components/Haptic.tsx`) are a contained swap —
but that's only the smallest, least meaningful piece of what's persisted.
The data that actually matters bypasses Redux entirely, hand-rolled directly
against AsyncStorage in independent modules, each owning one JSON blob under
one versioned key: `src/utils/customPacks.ts` (`custom_packs_v1`),
`src/utils/unlocks.ts` (`puzzle_unlocks_v1`), `src/utils/achievements.ts`
(`achievements_v1`), and three settings providers
(`AutoSaveCustomProvider.tsx`, `PackSelectionProvider.tsx`,
`KeyboardLayoutProvider.tsx`). **Scope this migration to cover all of those,
not just the redux `theme` slice** — same read-whole/write-whole shape, just
swapping `AsyncStorage.getItem`/`setItem` for MMKV's synchronous
`getString`/`set`, which also drops the `.then()`/async-effect boilerplate in
the three settings providers.

**Tradeoff:** MMKV is a native module, so it requires a dev client build —
not compatible with Expo Go. Not a blocker since none of these projects rely
on Expo Go currently.

**Scope:** Could be rolled out the same way to Lumber and CashierFu-Utility
once validated here, since all three share the identical redux-persist setup.
