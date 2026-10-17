import { act, fireEvent, render } from '@testing-library/react-native'
import { useEffect } from 'react'

import { Providers } from '@/components/Providers'
import { useStartSolo } from '@/hooks/useStartSolo'
import { DEFAULT_MODE, lettersMode } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'

// The real store: the round slice is what a start replaces, and the stats are what an abandon records.
const soloRound = () => store.getState().round.solo
const stats = () => store.getState().achievements.stats

// The round left waiting on the board: DOG on the Classic art (six mistakes), with these guesses.
const seedSoloRound = (guessedLetters: string[] = []) => {
  store.dispatch(roundActions.startSolo({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random', packKey: 'seeded-pack', packLabel: 'Seeded Pack', puzzleId: 'seeded-puzzle', difficultyTier: 'easy', packScope: 'selection' }))
  if (guessedLetters.length > 0) store.dispatch(roundActions.saveSoloProgress({ guessedLetters, hintRevealed: false }))
  return soloRound()
}

// What the loadout or a share link would hand over: a new puzzle, on a different art than the old one.
const NEXT_PUZZLE: GameStartPayload = { phrase: 'FISH', mode: lettersMode, sourceMode: 'random', packKey: 'next-pack', packLabel: 'Next Pack', puzzleId: 'next-puzzle', difficultyTier: 'medium', packScope: 'single' }

// A host component rather than renderHook: the hook hands back its confirm as an element, which has to
// be on screen (inside Providers, for its Portal host and the toast) to be answered. The hook's latest
// result is kept after every commit, the same way the color tests capture the theme.
let startSolo: ReturnType<typeof useStartSolo>
const Host = () => {
  const result = useStartSolo()
  useEffect(() => {
    startSolo = result
  })
  return result.abandonDialog
}
const renderHost = () =>
  render(
    <Providers>
      <Host />
    </Providers>
  )

const requestStart = async (callbacks: { onStarted: jest.Mock; onCancelled?: jest.Mock }) => {
  await act(async () => {
    startSolo.requestStart(NEXT_PUZZLE, callbacks)
  })
}

describe('useStartSolo', () => {
  beforeEach(() => {
    store.dispatch(achievementsActions.reset())
    store.dispatch(roundActions.reset())
  })

  it('starts right away when there is no round on the board', async () => {
    const screen = await renderHost()
    const onStarted = jest.fn()

    await requestStart({ onStarted })

    expect(onStarted).toHaveBeenCalledTimes(1)
    // Saved by art id, since a GameMode can't be persisted itself.
    expect(soloRound()).toEqual({ id: 1, guessedLetters: [], hintRevealed: false, puzzle: { phrase: 'FISH', modeId: 'letters', sourceMode: 'random', packKey: 'next-pack', packLabel: 'Next Pack', puzzleId: 'next-puzzle', difficultyTier: 'medium', packScope: 'single' } })
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  it('starts right away over a round with no guesses yet', async () => {
    const before = seedSoloRound()
    const screen = await renderHost()
    const onStarted = jest.fn()

    await requestStart({ onStarted })

    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(soloRound().id).toBe(before.id + 1)
    expect(soloRound().puzzle?.phrase).toBe('FISH')
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  // Won or lost, the game screen already recorded it, so leaving it costs nothing more.
  it.each([
    ['won', ['D', 'O', 'G']],
    ['lost', ['A', 'B', 'C', 'E', 'F', 'H']]
  ])('starts right away, recording nothing, over a round already %s', async (_outcome, guessedLetters) => {
    seedSoloRound(guessedLetters)
    const screen = await renderHost()
    const onStarted = jest.fn()

    await requestStart({ onStarted })

    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(soloRound().puzzle?.phrase).toBe('FISH')
    expect(stats().solo.played).toBe(0)
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  it('holds the start behind the abandon confirm when the round has a guess on it', async () => {
    const before = seedSoloRound(['Q'])
    const screen = await renderHost()
    const onStarted = jest.fn()
    const onCancelled = jest.fn()

    await requestStart({ onStarted, onCancelled })

    expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
    expect(screen.getByText("You've already made a guess. Starting a new puzzle will count this one as a loss.")).toBeTruthy()
    expect(onStarted).not.toHaveBeenCalled()
    expect(onCancelled).not.toHaveBeenCalled()
    expect(soloRound()).toEqual(before)
    expect(stats().solo.played).toBe(0)
  })

  it('records the abandoned round as a solo loss with its own counts on Abandon, then starts, calling onStarted once', async () => {
    // DOG: D and O right, Q wrong.
    const before = seedSoloRound(['D', 'Q', 'O'])
    const screen = await renderHost()
    const onStarted = jest.fn()
    const onCancelled = jest.fn()

    await requestStart({ onStarted, onCancelled })
    await fireEvent.press(screen.getByText('Abandon'))

    expect(stats().solo).toMatchObject({ played: 1, losses: 1, wins: 0 })
    expect(stats()).toMatchObject({ lettersGuessed: 3, lettersCorrect: 2 })
    expect(soloRound().id).toBe(before.id + 1)
    expect(soloRound()).toMatchObject({ guessedLetters: [], puzzle: { phrase: 'FISH', modeId: 'letters' } })
    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(onCancelled).not.toHaveBeenCalled()
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  // Abandon re-reads the board rather than trusting what the confirm asked about: guesses that landed
  // while it was up count too.
  it("records the loss with the round's counts as they stand at Abandon", async () => {
    seedSoloRound(['Q'])
    const screen = await renderHost()

    await requestStart({ onStarted: jest.fn() })
    // DOG: D right, Q and X wrong, and still short of Classic's six mistakes.
    await act(async () => {
      store.dispatch(roundActions.saveSoloProgress({ guessedLetters: ['Q', 'D', 'X'], hintRevealed: false }))
    })
    await fireEvent.press(screen.getByText('Abandon'))

    expect(stats().solo).toMatchObject({ played: 1, losses: 1 })
    expect(stats()).toMatchObject({ lettersGuessed: 3, lettersCorrect: 1 })
    expect(soloRound().puzzle?.phrase).toBe('FISH')
  })

  // The card can outlive what it asked about: a share link opened over the loadout starts its own
  // puzzle, and the game screen records a round it finishes itself. Only a round still unfinished,
  // with a guess on it, costs a loss, but the pending puzzle starts either way.
  it.each([
    ['replaced with a fresh one', () => store.dispatch(roundActions.startSolo({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom' }))],
    ['won', () => store.dispatch(roundActions.saveSoloProgress({ guessedLetters: ['Q', 'D', 'O', 'G'], hintRevealed: false }))],
    ['lost', () => store.dispatch(roundActions.saveSoloProgress({ guessedLetters: ['Q', 'A', 'B', 'C', 'E', 'F'], hintRevealed: false }))]
  ])('records nothing on Abandon, but still starts, calling onStarted once, when the round was %s while the confirm was up', async (_change, change) => {
    const before = seedSoloRound(['Q'])
    const screen = await renderHost()
    const onStarted = jest.fn()
    const onCancelled = jest.fn()

    await requestStart({ onStarted, onCancelled })
    await act(async () => {
      change()
    })
    // Still up: nothing closes it but an answer.
    expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
    await fireEvent.press(screen.getByText('Abandon'))

    expect(stats().solo.played).toBe(0)
    expect(stats().lettersGuessed).toBe(0)
    expect(store.getState().achievements.unlocked).not.toHaveProperty('first_game_played')
    expect(soloRound().id).toBeGreaterThan(before.id)
    expect(soloRound()).toMatchObject({ guessedLetters: [], hintRevealed: false, puzzle: { phrase: 'FISH', modeId: 'letters' } })
    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(onCancelled).not.toHaveBeenCalled()
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  // An abandon has no result card, so what it unlocks gets the fleet's achievement toast.
  it('toasts each achievement the abandon unlocks', async () => {
    seedSoloRound(['Q'])
    const screen = await renderHost()

    await requestStart({ onStarted: jest.fn() })
    await fireEvent.press(screen.getByText('Abandon'))

    expect(store.getState().achievements.unlocked).toHaveProperty('first_game_played')
    expect(await screen.findByText('First Word')).toBeTruthy()
    expect(screen.getAllByText('Achievement unlocked').length).toBeGreaterThan(0)
  })

  it('keeps the old round and records nothing on Cancel, calling onCancelled once', async () => {
    const before = seedSoloRound(['Q'])
    const screen = await renderHost()
    const onStarted = jest.fn()
    const onCancelled = jest.fn()

    await requestStart({ onStarted, onCancelled })
    await fireEvent.press(screen.getByText('Cancel'))

    expect(onCancelled).toHaveBeenCalledTimes(1)
    expect(onStarted).not.toHaveBeenCalled()
    expect(soloRound()).toEqual(before)
    expect(stats().solo.played).toBe(0)
    expect(screen.queryByText('Abandon This Puzzle?')).toBeNull()
  })

  it('cancels quietly when there is no onCancelled, and asks again on the next start', async () => {
    const before = seedSoloRound(['Q'])
    const screen = await renderHost()
    const onStarted = jest.fn()

    await requestStart({ onStarted })
    await fireEvent.press(screen.getByText('Cancel'))
    expect(soloRound()).toEqual(before)

    // The round still has its guess, so the next try is held back the same way.
    await requestStart({ onStarted })
    expect(screen.getByText('Abandon This Puzzle?')).toBeTruthy()
    await fireEvent.press(screen.getByText('Abandon'))

    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(stats().solo.losses).toBe(1)
  })
})
