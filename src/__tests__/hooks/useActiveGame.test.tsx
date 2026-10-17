import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { ActiveGameProvider, useActiveGame } from '@/hooks/useActiveGame'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'

// The app's store, as Providers.tsx hands it in (a module singleton, so the round slice is reset
// before every test). The redux-persist mock passes the round reducer straight through, so a
// rehydrated activeMode is just one already in the store when the provider is first asked.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <ActiveGameProvider>{children}</ActiveGameProvider>
  </ReduxProvider>
)

const renderActiveGame = () => {
  let renders = 0
  return renderHook(
    () => {
      renders += 1
      return useActiveGame()
    },
    { wrapper: Wrapper }
  ).then((utils) => ({ ...utils, renders: () => renders }))
}

const activeMode = () => store.getState().round.activeMode
const setActiveModeCalls = (dispatch: jest.SpyInstance) => dispatch.mock.calls.filter(([action]) => roundActions.setActiveMode.match(action)).map(([action]) => action.payload)

describe('useActiveGame', () => {
  let dispatch: jest.SpyInstance

  beforeEach(() => {
    store.dispatch(roundActions.reset())
    dispatch = jest.spyOn(store, 'dispatch')
  })

  afterEach(() => {
    dispatch.mockRestore()
  })

  describe('consumeResumeMode', () => {
    it('returns the game left open at launch the first time, then null every time after', async () => {
      store.dispatch(roundActions.setActiveMode('pnp'))
      const { result } = await renderActiveGame()

      expect(result.current.consumeResumeMode()).toBe('pnp')
      expect(result.current.consumeResumeMode()).toBeNull()
      // The saved mode itself stays: only the pending resume is spent.
      expect(activeMode()).toBe('pnp')
    })

    // Read when first asked, not at mount, so it sees the rehydrated slice even if the provider
    // mounted before rehydration landed.
    it('reads the store when first asked, not when the provider mounts', async () => {
      const { result } = await renderActiveGame()
      await act(async () => {
        store.dispatch(roundActions.setActiveMode('solo'))
      })

      expect(result.current.consumeResumeMode()).toBe('solo')
    })

    it('returns null when no game was left open, and stays spent once a game is', async () => {
      const { result } = await renderActiveGame()

      expect(result.current.consumeResumeMode()).toBeNull()
      await act(async () => {
        store.dispatch(roundActions.setActiveMode('solo'))
      })
      expect(result.current.consumeResumeMode()).toBeNull()
    })
  })

  describe('markActive', () => {
    it('saves the open game, dispatching only when it changes', async () => {
      const { result } = await renderActiveGame()

      await act(async () => {
        result.current.markActive('solo')
        result.current.markActive('solo')
      })
      expect(activeMode()).toBe('solo')
      expect(setActiveModeCalls(dispatch)).toEqual(['solo'])

      await act(async () => {
        result.current.markActive('pnp')
      })
      expect(activeMode()).toBe('pnp')
      expect(setActiveModeCalls(dispatch)).toEqual(['solo', 'pnp'])
    })

    // A share link opened cold lands in the game before Home ever asks; Home afterward must be Home.
    it('cancels a pending resume, even when the saved mode is unchanged', async () => {
      store.dispatch(roundActions.setActiveMode('solo'))
      dispatch.mockClear()
      const { result } = await renderActiveGame()

      await act(async () => {
        result.current.markActive('solo')
      })

      expect(setActiveModeCalls(dispatch)).toEqual([])
      expect(activeMode()).toBe('solo')
      expect(result.current.consumeResumeMode()).toBeNull()
    })
  })

  describe('clearActive', () => {
    it('clears the saved game, dispatching only when one is saved', async () => {
      const { result } = await renderActiveGame()

      await act(async () => {
        result.current.clearActive()
      })
      expect(setActiveModeCalls(dispatch)).toEqual([])

      await act(async () => {
        result.current.markActive('pnp')
        result.current.clearActive()
        result.current.clearActive()
      })
      expect(activeMode()).toBeNull()
      expect(setActiveModeCalls(dispatch)).toEqual(['pnp', null])
    })

    it('cancels a pending resume, so a mode saved later still never resumes', async () => {
      store.dispatch(roundActions.setActiveMode('pnp'))
      const { result } = await renderActiveGame()

      await act(async () => {
        result.current.clearActive()
      })
      expect(activeMode()).toBeNull()

      // Saved again without going through the provider: the resume was already spent.
      await act(async () => {
        store.dispatch(roundActions.setActiveMode('solo'))
      })
      expect(result.current.consumeResumeMode()).toBeNull()
    })
  })

  describe('cancelResume', () => {
    it('drops the pending resume without touching the saved mode', async () => {
      store.dispatch(roundActions.setActiveMode('solo'))
      dispatch.mockClear()
      const { result } = await renderActiveGame()

      await act(async () => {
        result.current.cancelResume()
      })

      expect(dispatch).not.toHaveBeenCalled()
      expect(activeMode()).toBe('solo')
      expect(result.current.consumeResumeMode()).toBeNull()
    })
  })

  // Every screen reads this context; a new value on every move between screens would re-render all
  // of them.
  it('hands out the same value across re-renders, and nothing re-renders when the active game changes', async () => {
    const { result, rerender, renders } = await renderActiveGame()
    const before = result.current

    await rerender({})
    expect(result.current).toBe(before)

    const rendersBefore = renders()
    await act(async () => {
      result.current.markActive('solo')
      result.current.markActive('pnp')
      result.current.clearActive()
    })
    expect(renders()).toBe(rendersBefore)
    expect(result.current).toBe(before)
  })

  it('does nothing outside the provider', async () => {
    const { result } = await renderHook(() => useActiveGame(), { wrapper: ({ children }: { children: ReactNode }) => <ReduxProvider store={store}>{children}</ReduxProvider> })
    store.dispatch(roundActions.setActiveMode('pnp'))
    dispatch.mockClear()

    result.current.markActive('solo')
    result.current.clearActive()

    expect(result.current.consumeResumeMode()).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
    expect(activeMode()).toBe('pnp')
  })
})
