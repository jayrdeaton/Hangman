import type { UnknownAction } from '@reduxjs/toolkit'
import { isValidProfile, type Profile, profilesReducer } from '@tastic/profile'

import { isPlayerKey } from '@/utils/players'

import { isRootRehydrate } from './rehydrate'

// The device's copy of the fleet's profile roster (@tastic/profile's profilesReducer and its
// profilesActions): the names, colors and tags every @tastic game on this device shares through the App
// Group (see useProfiles' ProfilesProvider, which keeps it in step with that shared roster). Persisted
// with the root blob (store.ts's whitelist), so the roster is there at launch, and on a device with no
// shared store (Android) this copy is the only one. Anything Hangman keeps for a profile lives in its
// own per-player slices, keyed by the profile's id, never on the profile.
export type ProfilesState = Profile[]

// Checks what comes back from storage: a profile that isn't valid, or whose id couldn't be a player key
// (utils/players.ts), is dropped, as is a second profile with an id already seen.
export const sanitizeProfiles = (value: unknown): ProfilesState => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const next: ProfilesState = []
  for (const item of value) {
    if (!isValidProfile(item) || !isPlayerKey(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    next.push({ id: item.id, name: item.name, color: item.color, tag: item.tag, createdAt: item.createdAt, updatedAt: item.updatedAt })
  }
  return next
}

// The package's reducer, with the root REHYDRATE sanitized the way every per-player slice's is (see
// rehydrate.ts): a fresh array, which redux-persist keeps over the raw stored value.
const profiles = (state: ProfilesState | undefined, action: UnknownAction): ProfilesState => (isRootRehydrate(action) ? sanitizeProfiles(action.payload?.profiles) : profilesReducer(state, action))

export default profiles
