import { useMemo } from 'react'
import { useDispatch, useStore } from 'react-redux'

import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import { pickGuestSeatColors } from '@/utils/guestSeats'
import { guestSeatKey, isGuestSeatKey, type PlayerKey, playerKeyFor } from '@/utils/players'
import { clearLeftGuestSeatUnlocks, clearPuzzleUnlocks } from '@/utils/unlocks'

import { useCatalogActions } from './useCatalog'
import { useGameStats } from './useGameStats'

export type PlayerData = {
  // One profile's stats and achievements and their unlocked puzzles, for Stats' Reset <Name>'s Stats.
  // The device bucket (All Profiles) keeps the rounds they played, as Solitaire's does.
  resetPlayer: (profileId: string) => Promise<void>
  // Everything Hangman keeps for a profile, for when it's gone: deleted on the Profiles screen, or in
  // another game on the shared roster (ProfilesProvider's self-heal). The above, plus their art,
  // difficulty and pack picks, their colors and their waiting solo round; their Pass & Play seats stay
  // at the table as guests, and if they're the one playing, Single Player's guest takes over.
  forgetPlayer: (profileId: string) => Promise<void>
  // Everything a Pass & Play guest seat's own guest kept (utils/players.ts' guestSeatKey), for when the
  // seat has left the table (the loadout's remove): their art, difficulty and pack picks, their colors,
  // their waiting solo round and their unlocked puzzles. Their rounds stay on the device's record, as
  // every guest's do. If they're the one playing, Single Player's guest takes over. Never seat 1's, whose
  // guest is Single Player's: they keep everything when the seat leaves.
  forgetGuestSeat: (seatId: string) => Promise<void>
  // Colors of their own for every guest seat at the table that has none yet (utils/guestSeats.ts), the
  // first time it's shown or made the active player. Nothing changes when every seat has some.
  colorGuestSeats: () => void
  // At launch: the unlocked puzzles of guest seats no longer at the table (the rest of what they kept
  // is trimmed as the store rehydrates, see rehydrate.ts' pruneLeftGuestSeats).
  clearLeftGuestSeats: () => Promise<void>
}

// The one place that knows everything Hangman files under a player's key (see utils/players.ts), so a
// reset, a delete or a seat leaving can't leave a piece of it behind. Resetting everyone is
// useGameStats' resetAll.
export const usePlayerData = (): PlayerData => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { removePlayerStats } = useGameStats()
  const { refreshUnlocks } = useCatalogActions()

  return useMemo(() => {
    // Their picks, colors and waiting round (their unlocked puzzles are storage's, below).
    const removeKept = (playerKey: PlayerKey) => {
      dispatch(playerSettingsActions.removePlayer(playerKey))
      dispatch(playerThemeActions.removePlayer(playerKey))
      dispatch(roundActions.removeSolo(playerKey))
    }
    const resetPlayer = async (profileId: string) => {
      removePlayerStats(profileId)
      await clearPuzzleUnlocks(playerKeyFor(profileId))
      refreshUnlocks()
    }
    const forgetPlayer = async (profileId: string) => {
      // First, so nothing reads the player's picks or round between their removal and the switch.
      if (store.getState().activePlayer.profileId === profileId) dispatch(activePlayerActions.setActivePlayer(null))
      removeKept(playerKeyFor(profileId))
      dispatch(roundActions.clearPnpProfile(profileId))
      await resetPlayer(profileId)
    }
    const forgetGuestSeat = async (seatId: string) => {
      const playerKey = guestSeatKey(seatId)
      if (!isGuestSeatKey(playerKey)) return
      if (store.getState().activePlayer.seatId === seatId) dispatch(activePlayerActions.setActivePlayer(null))
      removeKept(playerKey)
      await clearPuzzleUnlocks(playerKey)
      refreshUnlocks()
    }
    const colorGuestSeats = () => {
      for (const { playerKey, theme } of pickGuestSeatColors(store.getState())) dispatch(playerThemeActions.setPlayerTheme({ playerKey, theme }))
    }
    const clearLeftGuestSeats = () => clearLeftGuestSeatUnlocks(new Set(store.getState().round.pnp.session.players.map((player) => guestSeatKey(player.id))))
    return { resetPlayer, forgetPlayer, forgetGuestSeat, colorGuestSeats, clearLeftGuestSeats }
  }, [dispatch, store, removePlayerStats, refreshUnlocks])
}
