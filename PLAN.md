# Plan

## Swap redux-persist storage engine to MMKV

**Status:** Deferred, not urgent.

**Context:** expo-doctor flags `redux-persist` as unmaintained (no recent
releases). It's not broken — Hangman, Lumber, and CashierFu-Utility all use
the same `@reduxjs/toolkit` + `react-redux` + `redux-persist` stack on top of
`@react-native-async-storage/async-storage`, and it works fine on current
versions. Currently suppressed via `expo.doctor.reactNativeDirectoryCheck.exclude`
in `package.json`.

**Idea:** Rather than replacing redux-persist itself, swap the underlying
storage engine from AsyncStorage to `react-native-mmkv`. MMKV is synchronous
and significantly faster; redux-persist supports a custom storage adapter, so
this is a contained change (no Redux architecture rewrite).

**Tradeoff:** MMKV is a native module, so it requires a dev client build —
not compatible with Expo Go. Not a blocker since none of these projects rely
on Expo Go currently.

**Scope:** Could be rolled out the same way to Lumber and CashierFu-Utility
once validated here, since all three share the identical redux-persist setup.
