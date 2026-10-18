import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { PuzzleDefaultsProvider } from '@/components/PuzzleDefaultsProvider'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { useSelectArt } from '@/hooks/useSelectArt'
import { candleMode, DEFAULT_MODE, robotMode } from '@/modes/registry'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <PuzzleDefaultsProvider>{children}</PuzzleDefaultsProvider>
  </ReduxProvider>
)

// The pick and what it reads back as, side by side.
const renderSelectArt = () => renderHook(() => ({ selectArt: useSelectArt(), mode: usePuzzleDefaults().mode }), { wrapper })

const playerArt = (playerKey = GUEST_PLAYER_KEY) => store.getState().playerSettings[playerKey]?.modeId
const soloRound = (playerKey = GUEST_PLAYER_KEY) => selectSoloRound(store.getState().round, playerKey)
const seedSoloRound = (playerKey = GUEST_PLAYER_KEY) => {
  store.dispatch(roundActions.startSolo({ playerKey, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random' } }))
  store.dispatch(roundActions.saveSoloProgress({ playerKey, guessedLetters: ['D', 'Q'], hintRevealed: true }))
}

describe('useSelectArt', () => {
  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
    store.dispatch(roundActions.reset())
  })

  it("makes the pick the active player's art", async () => {
    const { result } = await renderSelectArt()

    await act(async () => {
      result.current.selectArt(robotMode)
    })

    expect(playerArt()).toBe(robotMode.id)
    expect(result.current.mode).toBe(robotMode)
  })

  // The art is cosmetic: the round on the board takes it as is, guesses, hint and all.
  it("redraws the player's waiting solo round, changing nothing else", async () => {
    seedSoloRound()
    store.dispatch(roundActions.setPnpWord({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom' }))
    const before = soloRound()
    const { result } = await renderSelectArt()

    await act(async () => {
      result.current.selectArt(candleMode)
    })

    expect(soloRound()).toEqual({ ...before, puzzle: { ...before.puzzle, modeId: candleMode.id } })
    // The word waiting is the second seat's guest's, a player of their own.
    expect(store.getState().round.pnp.puzzle?.modeId).toBe(DEFAULT_MODE.id)
  })

  it('redraws the Pass & Play word waiting for its guesser, a guest seat picking as its own guest', async () => {
    seedSoloRound()
    store.dispatch(roundActions.setPnpWord({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom' }))
    store.dispatch(activePlayerActions.setActivePlayer(null, 'p2'))
    const before = soloRound()
    const { result } = await renderSelectArt()

    await act(async () => {
      result.current.selectArt(candleMode)
    })

    expect(store.getState().round.pnp.puzzle?.modeId).toBe(candleMode.id)
    expect(playerArt(guestSeatKey('p2'))).toBe(candleMode.id)
    // Single Player's guest keeps their own art and round.
    expect(playerArt()).toBeUndefined()
    expect(soloRound()).toEqual(before)
  })

  // A player with no round waiting has nothing to redraw, and gets no empty round made for them.
  it('leaves the round slice alone for a player with no round waiting', async () => {
    const { result } = await renderSelectArt()

    await act(async () => {
      result.current.selectArt(candleMode)
    })

    expect(store.getState().round.solo).toEqual({})
  })

  it('picks for whoever is playing, never for anyone else', async () => {
    seedSoloRound()
    seedSoloRound('profile-a')
    store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    const { result } = await renderSelectArt()

    await act(async () => {
      result.current.selectArt(robotMode)
    })

    expect(playerArt('profile-a')).toBe(robotMode.id)
    expect(soloRound('profile-a').puzzle?.modeId).toBe(robotMode.id)
    expect(playerArt()).toBeUndefined()
    expect(soloRound().puzzle?.modeId).toBe(DEFAULT_MODE.id)
  })

  // The sheet's thumbnails are memoized on it.
  it('keeps the same callback until the player changes', async () => {
    const { result } = await renderSelectArt()
    const first = result.current.selectArt

    await act(async () => {
      result.current.selectArt(robotMode)
    })
    expect(result.current.selectArt).toBe(first)

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })
    expect(result.current.selectArt).not.toBe(first)
  })
})
