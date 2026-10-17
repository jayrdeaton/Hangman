import { fireEvent, render } from '@testing-library/react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { PlayScreen } from '@/components/PlayScreen'
import { Providers } from '@/components/Providers'
import { type ActiveGame, useActiveGame } from '@/hooks/useActiveGame'
import { classicMode, DEFAULT_MODE, robotMode } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { roundActions, type SavedPuzzle } from '@/redux/roundSlice'
import { store } from '@/redux/store'

// /play is where a share link lands (hangman://play?phrase=...&hint=...&mode=...). It draws nothing
// of its own: it puts the shared puzzle on the solo board and hands off to the game screen. Its
// params come from the shared expo-router mock's useLocalSearchParams, set per test, and where it
// sends the player is read off that mock's `router`, which safeBack (see utils/navigation.ts) was
// handed too.

const mockParams = jest.mocked(useLocalSearchParams)
const GAME_HREF = { pathname: '/game', params: { mode: 'solo' } }
const VALID_LINK = { phrase: 'Hello, World', hint: 'A friendly greeting', mode: robotMode.id }

// The real round and stats slices: what a link started, or an abandon recorded, is read straight
// from the store.
const soloRound = () => store.getState().round.solo
const soloRecord = () => store.getState().achievements.stats.solo

// A round already on the solo board, as the loadout would have left it.
const waitingPuzzle: SavedPuzzle = { phrase: 'DOG', modeId: classicMode.id, sourceMode: 'random', packKey: 'pack-1', packLabel: 'Test Pack', puzzleId: 'puzzle-1', difficultyTier: 'easy', packScope: 'selection' }
const seedSoloRound = (guessedLetters: string[]) => {
  store.dispatch(roundActions.startSolo(waitingPuzzle))
  store.dispatch(roundActions.saveSoloProgress({ guessedLetters, hintRevealed: false }))
}

const renderLink = (params: Record<string, string | string[]>) => {
  mockParams.mockReturnValue(params)
  return render(
    <Providers>
      <PlayScreen />
    </Providers>
  )
}

describe('PlayScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks keeps implementations, so a test that turned canGoBack on can't leak it.
    jest.mocked(router.canGoBack).mockReturnValue(false)
    store.dispatch(achievementsActions.reset())
    store.dispatch(roundActions.reset())
  })

  describe('a valid link', () => {
    it("puts the shared puzzle on the solo board, with the link's art and hint, and opens the game", async () => {
      await renderLink(VALID_LINK)

      expect(soloRound()).toMatchObject({ puzzle: { phrase: 'HELLO WORLD', modeId: robotMode.id, sourceMode: 'custom', hint: 'A friendly greeting' }, guessedLetters: [], hintRevealed: false })
      // A link's word belongs to no pack, so a win never counts toward one.
      expect(soloRound().puzzle).not.toHaveProperty('packKey')
      expect(soloRound().puzzle).not.toHaveProperty('puzzleId')
      expect(router.dismissTo).toHaveBeenCalledTimes(1)
      expect(router.dismissTo).toHaveBeenCalledWith(GAME_HREF)
      expect(router.back).not.toHaveBeenCalled()
      expect(router.replace).not.toHaveBeenCalled()
    })

    // The game screen reads the round from the store as it mounts, so it has to be there first.
    it('has the puzzle in the store by the time the game screen opens', async () => {
      let phraseOnArrival: string | undefined
      jest.mocked(router.dismissTo).mockImplementationOnce(() => {
        phraseOnArrival = soloRound().puzzle?.phrase
      })

      await renderLink(VALID_LINK)

      expect(phraseOnArrival).toBe('HELLO WORLD')
    })

    it('replaces the previous round with a fresh one', async () => {
      seedSoloRound([])
      const previousId = soloRound().id

      await renderLink(VALID_LINK)

      expect(soloRound().id).toBeGreaterThan(previousId)
      expect(soloRound().puzzle?.phrase).toBe('HELLO WORLD')
    })

    it('draws in the default art for a mode it does not know, and leaves the hint off when the link has none', async () => {
      await renderLink({ phrase: 'HELLO', mode: 'not-a-real-mode' })

      expect(soloRound().puzzle).toMatchObject({ phrase: 'HELLO', modeId: DEFAULT_MODE.id, sourceMode: 'custom' })
      expect(soloRound().puzzle?.hint).toBeUndefined()
      expect(router.dismissTo).toHaveBeenCalledWith(GAME_HREF)
    })

    it('starts the link only once, however often the screen renders', async () => {
      const { rerender } = await renderLink(VALID_LINK)
      const startedId = soloRound().id

      // A fresh params object, as the router hands out on a re-render.
      mockParams.mockReturnValue({ ...VALID_LINK })
      await rerender(
        <Providers>
          <PlayScreen />
        </Providers>
      )

      expect(soloRound().id).toBe(startedId)
      expect(router.dismissTo).toHaveBeenCalledTimes(1)
    })
  })

  describe('an invalid link', () => {
    it.each([
      ['no phrase', {}],
      ['a phrase with no letters in it', { phrase: '12345' }],
      ['a repeated phrase param', { phrase: ['HELLO', 'WORLD'] }],
      ['a phrase longer than 128 characters', { phrase: 'A'.repeat(129) }],
      ['a hint longer than 80 characters', { phrase: 'HELLO', hint: 'B'.repeat(81) }]
    ])('with %s starts nothing and goes Home when it was opened cold', async (_label, params) => {
      await renderLink(params)

      expect(soloRound().puzzle).toBeNull()
      expect(soloRound().id).toBe(0)
      expect(router.dismissTo).not.toHaveBeenCalled()
      expect(router.back).not.toHaveBeenCalled()
      expect(router.replace).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledWith('/')
    })

    it('goes back where the player was when there is somewhere to go back to', async () => {
      jest.mocked(router.canGoBack).mockReturnValue(true)

      await renderLink({ phrase: '12345' })

      expect(router.back).toHaveBeenCalledTimes(1)
      expect(router.replace).not.toHaveBeenCalled()
      expect(router.dismissTo).not.toHaveBeenCalled()
    })

    it('leaves a round already on the board alone', async () => {
      seedSoloRound(['Q'])
      const before = soloRound()

      await renderLink({})

      expect(soloRound()).toEqual(before)
      expect(soloRecord().losses).toBe(0)
    })
  })

  describe('over a solo round with guesses on it', () => {
    it('asks before abandoning it, and starts nothing yet', async () => {
      seedSoloRound(['Q'])

      const { getByText } = await renderLink(VALID_LINK)

      expect(getByText('Abandon This Puzzle?')).toBeTruthy()
      expect(soloRound().puzzle?.phrase).toBe('DOG')
      expect(soloRound().guessedLetters).toEqual(['Q'])
      expect(soloRecord().losses).toBe(0)
      expect(router.dismissTo).not.toHaveBeenCalled()
      expect(router.back).not.toHaveBeenCalled()
      expect(router.replace).not.toHaveBeenCalled()
    })

    it('goes back without starting the link or recording anything on Cancel', async () => {
      seedSoloRound(['Q'])
      const { getByText, queryByText } = await renderLink(VALID_LINK)

      await fireEvent.press(getByText('Cancel'))

      expect(queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound().puzzle?.phrase).toBe('DOG')
      expect(soloRound().guessedLetters).toEqual(['Q'])
      expect(soloRecord().losses).toBe(0)
      expect(router.dismissTo).not.toHaveBeenCalled()
      expect(router.replace).toHaveBeenCalledWith('/')
    })

    it('records the abandoned round as a loss, then starts the link and opens the game on Abandon', async () => {
      seedSoloRound(['Q'])
      const { getByText } = await renderLink(VALID_LINK)

      await fireEvent.press(getByText('Abandon'))

      expect(soloRecord().losses).toBe(1)
      expect(soloRound()).toMatchObject({ puzzle: { phrase: 'HELLO WORLD', modeId: robotMode.id, sourceMode: 'custom' }, guessedLetters: [] })
      expect(router.dismissTo).toHaveBeenCalledTimes(1)
      expect(router.dismissTo).toHaveBeenCalledWith(GAME_HREF)
      expect(router.back).not.toHaveBeenCalled()
      expect(router.replace).not.toHaveBeenCalled()
    })

    // A decided round was recorded when it ended, so leaving it costs nothing and needs no question.
    it('starts straight away over a round that already ended', async () => {
      // Every letter of DOG found: a win.
      seedSoloRound(['D', 'O', 'G'])

      const { queryByText } = await renderLink(VALID_LINK)

      expect(queryByText('Abandon This Puzzle?')).toBeNull()
      expect(soloRound().puzzle?.phrase).toBe('HELLO WORLD')
      expect(soloRecord().losses).toBe(0)
      expect(router.dismissTo).toHaveBeenCalledWith(GAME_HREF)
    })
  })

  // A link opened cold is where the player meant to go: the game the app was last closed on must not
  // take over Home once they leave the link's game.
  describe('the launch resume', () => {
    let activeGame: ActiveGame | null = null
    const ActiveGameProbe = () => {
      const value = useActiveGame()
      useEffect(() => {
        activeGame = value
      }, [value])
      return null
    }

    beforeEach(() => {
      activeGame = null
      store.dispatch(roundActions.setActiveMode('pnp'))
    })

    it('would resume the last game on a launch without a link', async () => {
      mockParams.mockReturnValue({})
      await render(
        <Providers>
          <ActiveGameProbe />
        </Providers>
      )

      expect(activeGame?.consumeResumeMode()).toBe('pnp')
    })

    it('is cancelled by a link, which leaves the saved game itself alone', async () => {
      mockParams.mockReturnValue(VALID_LINK)
      await render(
        <Providers>
          <PlayScreen />
          <ActiveGameProbe />
        </Providers>
      )

      expect(activeGame?.consumeResumeMode()).toBeNull()
      expect(store.getState().round.activeMode).toBe('pnp')
    })

    it('is cancelled by an invalid link too', async () => {
      mockParams.mockReturnValue({ phrase: '12345' })
      await render(
        <Providers>
          <PlayScreen />
          <ActiveGameProbe />
        </Providers>
      )

      expect(activeGame?.consumeResumeMode()).toBeNull()
    })
  })
})
