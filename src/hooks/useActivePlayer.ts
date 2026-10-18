import { useMemo } from 'react'
import { useSelector } from 'react-redux'

import type { RootState } from '@/redux/store'
import { type PlayerKey, playerKeyFor } from '@/utils/players'

export type ActivePlayer = {
  // The active profile's id, or null for a guest.
  profileId: string | null
  // The Pass & Play guest seat a guest sits in, or null (a profile, or Single Player's guest).
  seatId: string | null
  // What everything kept per player is filed under (utils/players.ts).
  key: PlayerKey
}

// Who is playing on this device right now (the activePlayer slice): a profile, a Pass & Play guest
// seat's guest, or Single Player's guest. Only re-renders its reader when the player changes.
export const useActivePlayer = (): ActivePlayer => {
  const profileId = useSelector((state: RootState) => state.activePlayer.profileId)
  const seatId = useSelector((state: RootState) => state.activePlayer.seatId)
  return useMemo(() => ({ profileId, seatId, key: playerKeyFor(profileId, seatId) }), [profileId, seatId])
}
