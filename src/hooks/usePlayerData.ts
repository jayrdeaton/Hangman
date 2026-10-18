import { useMemo } from 'react'
import { useDispatch, useStore } from 'react-redux'

import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import { playerKeyFor } from '@/utils/players'
import { clearPuzzleUnlocks } from '@/utils/unlocks'

import { useCatalogActions } from './useCatalog'
import { useGameStats } from './useGameStats'

export type PlayerData = {
  // One profile's stats and achievements and their unlocked puzzles, for Stats' Reset <Name>'s Stats.
  // The device bucket (All Profiles) keeps the rounds they played, as Solitaire's does.
  resetPlayer: (profileId: string) => Promise<void>
  // Everything Hangman keeps for a profile, for when it's gone: deleted on the Profiles screen, or in
  // another game on the shared roster (ProfilesProvider's self-heal). The above, plus their art,
  // difficulty and pack picks, their colors and their waiting solo round; their Pass & Play seats stay
  // at the table as guests, and if they're the one playing, the guest takes over.
  forgetPlayer: (profileId: string) => Promise<void>
}

// The one place that knows everything Hangman files under a profile's id (see utils/players.ts), so a
// reset or a delete can't leave a piece of it behind. Resetting everyone is useGameStats' resetAll.
export const usePlayerData = (): PlayerData => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { removePlayerStats } = useGameStats()
  const { refreshUnlocks } = useCatalogActions()

  return useMemo(() => {
    const resetPlayer = async (profileId: string) => {
      removePlayerStats(profileId)
      await clearPuzzleUnlocks(playerKeyFor(profileId))
      refreshUnlocks()
    }
    const forgetPlayer = async (profileId: string) => {
      const playerKey = playerKeyFor(profileId)
      // First, so nothing reads the player's picks or round between their removal and the switch.
      if (store.getState().activePlayer.profileId === profileId) dispatch(activePlayerActions.setActivePlayer(null))
      dispatch(playerSettingsActions.removePlayer(playerKey))
      dispatch(playerThemeActions.removePlayer(playerKey))
      dispatch(roundActions.removeSolo(playerKey))
      dispatch(roundActions.clearPnpProfile(profileId))
      await resetPlayer(profileId)
    }
    return { resetPlayer, forgetPlayer }
  }, [dispatch, store, removePlayerStats, refreshUnlocks])
}
