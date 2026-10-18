import { useMemo } from 'react'
import { useSelector } from 'react-redux'

import type { RootState } from '@/redux/store'
import { type PlayerKey, playerKeyFor } from '@/utils/players'

export type ActivePlayer = {
  // The active profile's id, or null for the guest.
  profileId: string | null
  // What everything kept per player is filed under (utils/players.ts).
  key: PlayerKey
}

// Who is playing on this device right now (the activePlayer slice): a profile picked in the player
// picker, or the guest. Only re-renders its reader when the player changes.
export const useActivePlayer = (): ActivePlayer => {
  const profileId = useSelector((state: RootState) => state.activePlayer.profileId)
  return useMemo(() => ({ profileId, key: playerKeyFor(profileId) }), [profileId])
}
