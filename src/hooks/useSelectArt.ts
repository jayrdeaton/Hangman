import { useCallback } from 'react'
import { useDispatch } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { roundActions } from '@/redux/roundSlice'
import type { GameMode } from '@/types/gameModes'

// The one way art gets picked (today the Settings sheet's ART grid, ArtPicker): it becomes the active
// player's art for every puzzle from here on (their playerSettings entry, through usePuzzleDefaults),
// and, since the art is cosmetic, it also redraws the rounds already waiting (roundSlice's setRoundArt
// says which: today the player's own solo round and the Pass & Play round). A round open on the board
// behind the sheet takes the new art live: Game froze its mistake limit when the round began, so only
// the picture changes, never the rules. Anything that picks art later (the profile picker, a player's
// own page) should come through here too, so a pick can never update one without the other.
//
// A stable callback for the memoized thumbnails that take it: it only changes with the player.
export const useSelectArt = (): ((mode: GameMode) => void) => {
  const dispatch = useDispatch()
  const { key: playerKey } = useActivePlayer()
  const { setMode } = usePuzzleDefaults()
  return useCallback(
    (mode: GameMode) => {
      setMode(mode)
      dispatch(roundActions.setRoundArt({ playerKey, modeId: mode.id }))
    },
    [setMode, dispatch, playerKey]
  )
}
