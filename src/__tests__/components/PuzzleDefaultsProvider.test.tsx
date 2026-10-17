import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { PuzzleDefaultsProvider } from '@/components/PuzzleDefaultsProvider'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { DEFAULT_MODE, robotMode } from '@/modes/registry'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <PuzzleDefaultsProvider>{children}</PuzzleDefaultsProvider>
  </ReduxProvider>
)

const renderDefaults = () => renderHook(() => usePuzzleDefaults(), { wrapper })

describe('PuzzleDefaultsProvider', () => {
  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
  })

  // Nothing to wait for: the picks are in redux, rehydrated before anything renders.
  it('is ready at once, with the default art and any difficulty for a player who never picked', async () => {
    const { result } = await renderDefaults()

    expect(result.current).toMatchObject({ mode: DEFAULT_MODE, difficulty: 'any', ready: true })
  })

  it("saves a pick as the active player's", async () => {
    const { result } = await renderDefaults()

    await act(async () => {
      result.current.setMode(robotMode)
      result.current.setDifficulty('hard')
    })

    expect(result.current).toMatchObject({ mode: robotMode, difficulty: 'hard' })
    expect(store.getState().playerSettings).toEqual({ [GUEST_PLAYER_KEY]: { modeId: robotMode.id, difficulty: 'hard', packKeys: null } })
  })

  it("switches to the new player's picks when the player changes", async () => {
    store.dispatch(playerSettingsActions.setMode({ playerKey: 'profile-a', modeId: robotMode.id }))
    store.dispatch(playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'easy' }))
    const { result } = await renderDefaults()
    expect(result.current).toMatchObject({ mode: DEFAULT_MODE, difficulty: 'easy' })

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })

    expect(result.current).toMatchObject({ mode: robotMode, difficulty: 'any' })
  })

  // An art id that no longer exists (a mode removed in an update) plays the default art.
  it('resolves a saved art id that no longer exists to the default art', async () => {
    store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: 'retired-art' }))
    const { result } = await renderDefaults()

    expect(result.current.mode).toBe(DEFAULT_MODE)
  })

  // The loadouts' memoized drawers take these as props.
  it("hands back the same value until a pick changes, and doesn't change it for another player's pick", async () => {
    const { result, rerender } = await renderDefaults()
    const before = result.current

    await rerender({})
    await act(async () => {
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: 'profile-a', difficulty: 'hard' }))
    })

    expect(result.current).toBe(before)
  })
})
