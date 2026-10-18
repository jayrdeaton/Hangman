import AsyncStorage from '@react-native-async-storage/async-storage'
import { configureStore } from '@reduxjs/toolkit'
import { createThemeReducer } from '@rific/auto-paper'
import { keepAwakeReducer } from '@rific/core'
import { defaultSoundSettings, hapticReducer, soundReducer, type SoundSettings } from '@rific/feedback-press'
import { combineReducers } from 'redux'
import { FLUSH, PAUSE, PERSIST, type PersistedState, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist'

import { sanitizeRoundState } from '@/utils/roundState'

import achievements from './achievementsSlice'
import activePlayer from './activePlayerSlice'
import playerSettings from './playerSettingsSlice'
import playerTheme from './playerThemeSlice'
import profiles from './profilesSlice'
import round from './roundSlice'

// @rific/feedback-press's own soundReducer defaults `enabled` to true unconditionally (that
// default isn't published with the dev-only override yet). Wrap it so a fresh install with no
// persisted preference (redux-persist finds nothing in AsyncStorage for the `sound` key) defaults
// muted in dev/simulator builds so Claude/local testing doesn't blast audio; production builds
// still default to sound on. All actual action handling still delegates to the package's reducer.
const initialSoundSettings: SoundSettings = { ...defaultSoundSettings, enabled: !__DEV__ }
const appSoundReducer = (state: SoundSettings = initialSoundSettings, action: { type: string }): SoundSettings => soundReducer(state, action)

// The rounds on the board (each player's solo round and the Pass & Play one), saved on every guess so a
// relaunch puts the same board back. Under its own key rather than in the root whitelist: the root blob
// holds the stats and achievements, and rewriting all of that on every letter would be wasteful. A
// stored blob that fails the checks in sanitizeRoundState falls back to empty rounds. Version 2 is the
// per-player solo rounds; a version 1 blob's single solo round doesn't pass, so it's dropped, not
// carried over. Version 3 is the Pass & Play session (players and standings) kept with its round; an
// older blob has none, so it starts a fresh one.
const roundPersistConfig = {
  key: 'round',
  storage: AsyncStorage,
  version: 3,
  migrate: (state: PersistedState) => Promise.resolve(state ? ({ ...sanitizeRoundState(state), _persist: state._persist } as PersistedState) : state)
}

const rootReducer = combineReducers({
  theme: createThemeReducer({ color: '#f44336' }),
  haptic: hapticReducer,
  sound: appSoundReducer,
  // @rific/core's Keep Awake setting (see Providers.tsx's KeepAwakeBridge), under the namespace its
  // REHYDRATE handling expects.
  keepAwake: keepAwakeReducer,
  // Stats and unlocked achievements (@tastic/achievements). Listed in the whitelist below, or nothing
  // in it would survive a relaunch.
  achievements,
  // The fleet's profile roster (see profilesSlice.ts), who is playing (a profile, or the guest), and
  // what each player has picked: the art, difficulty and packs, and their colors. Each sanitizes what it
  // rehydrates (see rehydrate.ts). All four are in the whitelist below for the same reason as
  // achievements.
  profiles,
  activePlayer,
  playerSettings,
  playerTheme,
  round: persistReducer(roundPersistConfig, round)
})

const persistConfig = { key: 'root', storage: AsyncStorage, whitelist: ['theme', 'haptic', 'sound', 'achievements', 'profiles', 'activePlayer', 'playerSettings', 'playerTheme', 'keepAwake'] }
const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore redux-persist action types which may include non-serializable values
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
      }
    })
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
