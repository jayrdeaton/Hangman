import { useToast } from '@rific/toaster'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { type JSX, useCallback, useState } from 'react'
import { useDispatch, useStore } from 'react-redux'

import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import { roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'
import { countWrongGuesses, hasUnfinishedGuesses, toSavedPuzzle } from '@/utils/roundState'

import { useGameStats } from './useGameStats'

export type StartSoloCallbacks = {
  // Runs once the new puzzle is in the round slice: normally a trip to the game screen.
  onStarted: () => void
  onCancelled?: () => void
}

// Puts a new solo puzzle on the board, unless that would abandon a round the player has already put
// a guess into. Then it asks first, and a confirmed abandon counts as a loss, the same as running out
// of guesses would (a fresh round, or one already decided, costs nothing to leave). Shared by the
// loadout (Random, a pack's quick start, a puzzle picked from a list) and share links (/play).
// Render `abandonDialog` wherever the hook is used.
export const useStartSolo = (): { requestStart: (payload: GameStartPayload, callbacks: StartSoloCallbacks) => void; abandonDialog: JSX.Element } => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { recordSoloRound } = useGameStats()
  const { success } = useToast()
  const [pending, setPending] = useState<{ payload: GameStartPayload; callbacks: StartSoloCallbacks } | null>(null)

  const start = useCallback(
    (payload: GameStartPayload, callbacks: StartSoloCallbacks) => {
      dispatch(roundActions.startSolo(toSavedPuzzle(payload)))
      callbacks.onStarted()
    },
    [dispatch]
  )

  const requestStart = useCallback(
    (payload: GameStartPayload, callbacks: StartSoloCallbacks) => {
      if (hasUnfinishedGuesses(store.getState().round.solo)) {
        setPending({ payload, callbacks })
        return
      }
      start(payload, callbacks)
    },
    [store, start]
  )

  // Records the loss BEFORE the new puzzle replaces the old one's guesses in the slice. Re-checks the
  // round first: the card can outlive what it asked about (a share link opened over the loadout starts
  // its own puzzle), and only a round still unfinished, with a guess on it, costs a loss.
  const handleConfirm = useCallback(() => {
    if (!pending) return
    const solo = store.getState().round.solo
    const { puzzle, guessedLetters } = solo
    if (puzzle && hasUnfinishedGuesses(solo)) {
      // An abandon has no round-end card, so anything it unlocks (the first puzzle played, a day
      // streak rung) gets the fleet's achievement toast instead, the same as a new custom pack's.
      recordSoloRound({ result: 'loss', wrongGuesses: countWrongGuesses(puzzle.phrase, guessedLetters), guessCount: guessedLetters.length }).forEach((achievement) => success(achievement.title, 'Achievement unlocked', undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon }))
    }
    setPending(null)
    start(pending.payload, pending.callbacks)
  }, [pending, store, recordSoloRound, success, start])

  const handleCancel = useCallback(() => {
    const callbacks = pending?.callbacks
    setPending(null)
    callbacks?.onCancelled?.()
  }, [pending])

  const abandonDialog = <ConfirmDialog visible={pending !== null} title='Abandon This Puzzle?' message="You've already made a guess. Starting a new puzzle will count this one as a loss." icon='flag-outline' confirmLabel='Abandon' cancelLabel='Cancel' destructive onConfirm={handleConfirm} onCancel={handleCancel} />

  return { requestStart, abandonDialog }
}
