import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { GUEST_PLAYER_KEY, isPlayerKey } from '@/utils/players'

import { isRootRehydrate } from './rehydrate'

// Who is playing on this device: a @tastic/profile profile's id, or null for the guest (see
// utils/players.ts), set from the player picker (useProfiles' selectPlayer) and dropped back to the
// guest when that profile is forgotten; everything kept per player reads it through useActivePlayer. Persisted with the root blob (store.ts's whitelist), and always this device's own,
// never part of a shared profile roster.
export type ActivePlayerState = { profileId: string | null }

export const initialActivePlayerState: ActivePlayerState = { profileId: null }

// A stored id that can't be a profile's falls back to the guest.
export const sanitizeActivePlayer = (value: unknown): ActivePlayerState => {
  const profileId = value && typeof value === 'object' ? (value as Record<string, unknown>).profileId : null
  return { profileId: isPlayerKey(profileId) && profileId !== GUEST_PLAYER_KEY ? profileId : null }
}

const activePlayerSlice = createSlice({
  name: 'activePlayer',
  initialState: initialActivePlayerState,
  reducers: {
    setActivePlayer: (state, action: PayloadAction<string | null>) => {
      state.profileId = action.payload
    }
  },
  extraReducers: (builder) => {
    builder.addMatcher(isRootRehydrate, (_state, action) => sanitizeActivePlayer(action.payload?.activePlayer))
  }
})

export const activePlayerActions = activePlayerSlice.actions
export default activePlayerSlice.reducer
