import { ConfirmDialog } from '@tastic/hud/chrome'
import { type JSX, useCallback, useState } from 'react'
import { useDispatch, useStore } from 'react-redux'

import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'
import { countWrongGuesses, hasUnfinishedGuesses, toSavedPuzzle } from '@/utils/roundState'

import { type ActivePlayer, useActivePlayer } from './useActivePlayer'
import { useGameStats } from './useGameStats'
import { useUnlockToasts } from './useUnlockToasts'

export type StartSoloCallbacks = {
  // Runs once the new puzzle is in the round slice: normally a trip to the game screen.
  onStarted: () => void
  onCancelled?: () => void
}

// Puts a new solo puzzle on the active player's board, unless that would abandon a round they've
// already put a guess into. Then it asks first, and a confirmed abandon counts as a loss, the same as
// running out of guesses would (a fresh round, or one already decided, costs nothing to leave). Shared
// by the loadout (Ready, a puzzle picked from a pack's list, Play This Pack) and share links (/play).
// Render `abandonDialog` wherever the hook is used; `asking` is whether it's up.
export const useStartSolo = (): { requestStart: (payload: GameStartPayload, callbacks: StartSoloCallbacks) => void; abandonDialog: JSX.Element; asking: boolean } => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const player = useActivePlayer()
  const { recordSoloRound } = useGameStats()
  const showUnlockToasts = useUnlockToasts()
  // The player is the one asked about: the board being replaced is theirs, and so is the loss if they
  // confirm, whoever is active by the time they answer.
  const [pending, setPending] = useState<{ payload: GameStartPayload; callbacks: StartSoloCallbacks; owner: ActivePlayer } | null>(null)

  const start = useCallback(
    (payload: GameStartPayload, callbacks: StartSoloCallbacks, owner: ActivePlayer) => {
      dispatch(roundActions.startSolo({ playerKey: owner.key, puzzle: toSavedPuzzle(payload) }))
      callbacks.onStarted()
    },
    [dispatch]
  )

  const requestStart = useCallback(
    (payload: GameStartPayload, callbacks: StartSoloCallbacks) => {
      if (hasUnfinishedGuesses(selectSoloRound(store.getState().round, player.key))) {
        setPending({ payload, callbacks, owner: player })
        return
      }
      start(payload, callbacks, player)
    },
    [store, player, start]
  )

  // Records the loss BEFORE the new puzzle replaces the old one's guesses in the slice, for the player
  // whose round it was. Re-checks the round first: the card can outlive what it asked about (a share
  // link opened over the loadout starts its own puzzle), and only a round still unfinished, with a guess
  // on it, costs a loss.
  const handleConfirm = useCallback(() => {
    if (!pending) return
    const { owner } = pending
    const solo = selectSoloRound(store.getState().round, owner.key)
    const { puzzle, guessedLetters } = solo
    if (puzzle && hasUnfinishedGuesses(solo)) {
      // An abandon has no round-end card, so anything it unlocks (the first puzzle played, a day
      // streak rung) gets the fleet's achievement toast instead, the same as a new custom pack's,
      // naming the owner when they're a profile.
      showUnlockToasts(recordSoloRound({ result: 'loss', wrongGuesses: countWrongGuesses(puzzle.phrase, guessedLetters), guessCount: guessedLetters.length }, owner.profileId), owner.profileId)
    }
    setPending(null)
    start(pending.payload, pending.callbacks, owner)
  }, [pending, store, recordSoloRound, showUnlockToasts, start])

  const handleCancel = useCallback(() => {
    const callbacks = pending?.callbacks
    setPending(null)
    callbacks?.onCancelled?.()
  }, [pending])

  const abandonDialog = <ConfirmDialog visible={pending !== null} title='Abandon This Puzzle?' message="You've already made a guess. Starting a new puzzle will count this one as a loss." icon='flag-outline' confirmLabel='Abandon' cancelLabel='Cancel' destructive onConfirm={handleConfirm} onCancel={handleCancel} />

  return { requestStart, abandonDialog, asking: pending !== null }
}
