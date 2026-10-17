import { act, fireEvent, render } from '@testing-library/react-native'
import { router, useIsFocused } from 'expo-router'

import { HomeScreen } from '@/components/HomeScreen'
import { Providers } from '@/components/Providers'
import { achievementsActions } from '@/redux/achievementsSlice'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'

// The hero's art and its loop have their own suites (HeroTitle, useArtDemoLoop). Here it only shows
// whether Home asked it to pause.
jest.mock('@/components/HeroTitle', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return { HeroTitle: ({ paused }: { paused: boolean }) => createElement(Text, { testID: 'hero' }, paused ? 'paused' : 'playing') }
})

const mockRouter = jest.mocked(router)
const mockUseIsFocused = jest.mocked(useIsFocused)

// The whole app's providers, as the root layout mounts them: a fresh ActiveGameProvider per render,
// so each test is a cold launch.
const home = (key?: string) => (
  <Providers>
    <HomeScreen key={key} />
  </Providers>
)
const renderHome = () => render(home())

// Where the redirect would send the player (the expo-router mock renders its href as JSON).
const redirectHref = (screen: Awaited<ReturnType<typeof renderHome>>) => JSON.parse(screen.getByTestId('redirect').props.children)

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseIsFocused.mockReturnValue(true)
    store.dispatch(roundActions.reset())
    store.dispatch(achievementsActions.reset())
  })

  describe('with no game left open', () => {
    it('shows the hero, Single Player and Pass & Play, and no redirect', async () => {
      const { getByText, getByTestId, queryByTestId } = await renderHome()

      expect(getByTestId('hero')).toBeTruthy()
      expect(getByText('Single Player')).toBeTruthy()
      expect(getByText('Pass & Play')).toBeTruthy()
      expect(queryByTestId('redirect')).toBeNull()
    })

    it.each([
      ['Single Player', 'solo'],
      ['Pass & Play', 'pnp']
    ])('opens the %s loadout', async (label, mode) => {
      const { getByText } = await renderHome()

      await fireEvent.press(getByText(label))

      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode } })
    })

    // The fleet's title screen keeps the trophy in the back corner.
    it('opens Stats & Achievements from the trophy', async () => {
      const { getByLabelText } = await renderHome()

      await fireEvent.press(getByLabelText('Stats & Achievements'))

      expect(mockRouter.push).toHaveBeenCalledTimes(1)
      expect(mockRouter.push).toHaveBeenCalledWith('/achievements')
    })

    it('opens Settings from the cog, without navigating', async () => {
      const { getByLabelText, getByText, queryByText } = await renderHome()
      expect(queryByText('KEYBOARD')).toBeNull()

      await fireEvent.press(getByLabelText('Settings'))

      expect(getByText('KEYBOARD')).toBeTruthy()
      expect(getByText('BACKUP')).toBeTruthy()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    // Home stays mounted under every other screen, so its art loop mustn't run behind them.
    it("pauses the hero's art while another screen covers Home", async () => {
      const { getByTestId, rerender } = await renderHome()
      expect(getByTestId('hero').props.children).toBe('playing')

      mockUseIsFocused.mockReturnValue(false)
      await rerender(home())

      expect(getByTestId('hero').props.children).toBe('paused')
    })
  })

  describe('with a game left open at launch', () => {
    // Straight back into the game, with no push animation (resume) and no menu painted on the way.
    it.each(['solo', 'pnp'] as const)('redirects into the %s game instead of showing the menu', async (mode) => {
      store.dispatch(roundActions.setActiveMode(mode))
      const screen = await renderHome()

      expect(redirectHref(screen)).toEqual({ pathname: '/game', params: { mode, resume: '1' } })
      expect(screen.queryByText('Single Player')).toBeNull()
      expect(screen.queryByText('Pass & Play')).toBeNull()
      expect(screen.queryByTestId('hero')).toBeNull()
      expect(mockRouter.push).not.toHaveBeenCalled()
      // Only the pending resume is spent: the saved mode is the game screen's to clear.
      expect(store.getState().round.activeMode).toBe(mode)
    })

    // Back to Home from the resumed game is Home, not another trip into the game.
    it('shows the menu the next time Home mounts', async () => {
      store.dispatch(roundActions.setActiveMode('solo'))
      const { getByText, queryByTestId, rerender } = await renderHome()
      expect(queryByTestId('redirect')).toBeTruthy()

      await rerender(home('again'))

      expect(queryByTestId('redirect')).toBeNull()
      expect(getByText('Single Player')).toBeTruthy()
    })
  })

  // A live check would bounce the player back into the game every time the store moved.
  describe('decides once, when it mounts', () => {
    it('keeps the menu when a game is saved afterward', async () => {
      const { getByText, queryByTestId, rerender } = await renderHome()

      await act(async () => {
        store.dispatch(roundActions.setActiveMode('pnp'))
      })
      await rerender(home())

      expect(queryByTestId('redirect')).toBeNull()
      expect(getByText('Single Player')).toBeTruthy()
    })

    it('keeps the redirect when the saved game is cleared afterward', async () => {
      store.dispatch(roundActions.setActiveMode('solo'))
      const screen = await renderHome()

      await act(async () => {
        store.dispatch(roundActions.setActiveMode(null))
      })
      await screen.rerender(home())

      expect(redirectHref(screen)).toEqual({ pathname: '/game', params: { mode: 'solo', resume: '1' } })
      expect(screen.queryByText('Single Player')).toBeNull()
    })
  })
})
