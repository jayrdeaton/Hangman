import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { isPlayerKey, isProfileId, type PlayerRef } from '@/utils/players'

import { isRootRehydrate } from './rehydrate'

// Who is playing on this device: a @tastic/profile profile's id, or null for a guest, with the Pass &
// Play guest seat they sit in (null for Single Player's guest; see utils/players.ts). Set through
// useProfiles' selectPlayer (the player picker, the Pass & Play page's focused seat, whoever's turn it
// is in a Pass & Play round) and dropped back to Single Player's guest when that profile is forgotten
// or that seat leaves the table; everything kept per player reads it through useActivePlayer.
// Persisted with the root blob (store.ts's whitelist), and always this device's own, never part of a
// shared profile roster.
export type ActivePlayerState = PlayerRef

export const initialActivePlayerState: ActivePlayerState = { profileId: null, seatId: null }

// A stored id that can't be a profile's falls back to a guest, and a seat id that can't be a seat's to
// Single Player's guest. Whether the seat is still at the table is the round's to say, which comes back
// under its own key: rehydrate.ts's pruneLeftGuestSeats checks it once both are in.
export const sanitizeActivePlayer = (value: unknown): ActivePlayerState => {
  const stored = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (isProfileId(stored.profileId)) return { profileId: stored.profileId, seatId: null }
  return { profileId: null, seatId: isPlayerKey(stored.seatId) ? stored.seatId : null }
}

const activePlayerSlice = createSlice({
  name: 'activePlayer',
  initialState: initialActivePlayerState,
  reducers: {
    // A profile, by id; or null and a guest seat's id for that seat's guest, or null alone for Single
    // Player's guest. A profile never keeps a seat.
    setActivePlayer: {
      reducer: (_state, action: PayloadAction<ActivePlayerState>) => action.payload,
      prepare: (profileId: string | null, seatId: string | null = null) => ({ payload: { profileId, seatId: profileId ? null : seatId } })
    }
  },
  extraReducers: (builder) => {
    builder.addMatcher(isRootRehydrate, (_state, action) => sanitizeActivePlayer(action.payload?.activePlayer))
  }
})

export const activePlayerActions = activePlayerSlice.actions
export default activePlayerSlice.reducer
