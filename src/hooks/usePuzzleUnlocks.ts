import { useEffect, useMemo, useState } from 'react'

import type { PlayerKey } from '@/utils/players'
import { getDevicePuzzleUnlockMap, getPuzzleUnlockMap, type PuzzleUnlockMap } from '@/utils/unlocks'

import { useActivePlayer } from './useActivePlayer'
import { useUnlockVersion } from './useCatalog'

export type PuzzleUnlocks = {
  unlockMap: PuzzleUnlockMap
  // Whether unlockMap is this player's, read from storage. Until then (and for a moment after the
  // player changes) it's empty, so a draw that prefers unsolved puzzles waits for it.
  loaded: boolean
}

export type PuzzleUnlocksOptions = {
  // False while whatever shows the map is off screen (Choose Packs or a pack's page while away): it isn't read until it's
  // true again, and the last map read stays in the meantime. Defaults to true.
  enabled?: boolean
}

const NO_UNLOCKS: PuzzleUnlockMap = {}

// One player's unlocked puzzles (or, for null, every player's together: the device's, see
// getDevicePuzzleUnlockMap), read from storage and read again whenever useCatalog's unlockVersion moves
// (a win, a backup import, a stats reset) or the player changes.
export const usePlayerPuzzleUnlocks = (playerKey: PlayerKey | null, { enabled = true }: PuzzleUnlocksOptions = {}): PuzzleUnlocks => {
  const unlockVersion = useUnlockVersion()
  // Whose map was read last, so a change of player never shows the previous player's for a beat.
  const [read, setRead] = useState<{ playerKey: PlayerKey | null; unlockMap: PuzzleUnlockMap } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let mounted = true
    void (playerKey === null ? getDevicePuzzleUnlockMap() : getPuzzleUnlockMap(playerKey)).then((unlockMap) => {
      if (mounted) setRead({ playerKey, unlockMap })
    })
    return () => {
      mounted = false
    }
  }, [playerKey, unlockVersion, enabled])

  return useMemo(() => (read && read.playerKey === playerKey ? { unlockMap: read.unlockMap, loaded: true } : { unlockMap: NO_UNLOCKS, loaded: false }), [read, playerKey])
}

// The active player's unlocked puzzles: what every pack list, progress count and draw reads.
export const usePuzzleUnlocks = (options?: PuzzleUnlocksOptions): PuzzleUnlocks => usePlayerPuzzleUnlocks(useActivePlayer().key, options)
