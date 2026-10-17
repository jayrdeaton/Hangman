import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { CatalogProvider, useCatalogActions } from '@/hooks/useCatalog'
import { usePlayerPuzzleUnlocks, usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { getDevicePuzzleUnlockMap, getPuzzleUnlockMap, type PuzzleUnlockMap } from '@/utils/unlocks'

// Each player's map, as storage would hand it back.
let mockMaps: Record<string, PuzzleUnlockMap> = {}
jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn((playerKey: string) => Promise.resolve(mockMaps[playerKey] ?? {})),
  getDevicePuzzleUnlockMap: jest.fn(() => Promise.resolve({ device: ['all'] }))
}))
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockGetDevicePuzzleUnlockMap = jest.mocked(getDevicePuzzleUnlockMap)

const wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <CatalogProvider>{children}</CatalogProvider>
  </ReduxProvider>
)

// The hook under test, plus the catalog's refresh, so a test can move the unlock count.
const renderUnlocks = (enabled?: boolean) => renderHook(({ on }: { on?: boolean }) => ({ unlocks: usePuzzleUnlocks(on === undefined ? undefined : { enabled: on }), actions: useCatalogActions() }), { wrapper, initialProps: { on: enabled } })

beforeEach(() => {
  mockMaps = { [GUEST_PLAYER_KEY]: { animals: ['lion'] }, 'profile-a': { animals: ['tiger'] } }
  mockGetPuzzleUnlockMap.mockClear()
  mockGetDevicePuzzleUnlockMap.mockClear()
  store.dispatch(activePlayerActions.setActivePlayer(null))
})

describe('usePuzzleUnlocks', () => {
  it("reads the active player's unlocked puzzles, flagging them loaded", async () => {
    const { result } = await renderUnlocks()

    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledWith(GUEST_PLAYER_KEY)
    expect(result.current.unlocks).toEqual({ unlockMap: { animals: ['lion'] }, loaded: true })
  })

  it('reads them again when the unlock count moves', async () => {
    const { result } = await renderUnlocks()
    mockMaps[GUEST_PLAYER_KEY] = { animals: ['lion', 'bear'] }

    await act(async () => result.current.actions.refreshUnlocks())

    expect(result.current.unlocks.unlockMap).toEqual({ animals: ['lion', 'bear'] })
  })

  // A change of player never shows the previous player's for a beat: empty and not loaded until the
  // new player's read lands.
  it("switches to the new player's when the player changes", async () => {
    let resolveNext!: (map: PuzzleUnlockMap) => void
    const { result } = await renderUnlocks()
    mockGetPuzzleUnlockMap.mockImplementationOnce(() => new Promise((resolve) => (resolveNext = resolve)))

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })
    expect(mockGetPuzzleUnlockMap).toHaveBeenLastCalledWith('profile-a')
    expect(result.current.unlocks).toEqual({ unlockMap: {}, loaded: false })

    await act(async () => resolveNext({ animals: ['tiger'] }))
    expect(result.current.unlocks).toEqual({ unlockMap: { animals: ['tiger'] }, loaded: true })
  })

  // A closed drawer: nothing is read until it opens, and a count moving while it's closed waits too.
  it("doesn't read while disabled, keeping the last map read", async () => {
    const { result, rerender } = await renderUnlocks(false)
    expect(mockGetPuzzleUnlockMap).not.toHaveBeenCalled()
    expect(result.current.unlocks.loaded).toBe(false)

    await rerender({ on: true })
    expect(result.current.unlocks.unlockMap).toEqual({ animals: ['lion'] })

    await rerender({ on: false })
    mockMaps[GUEST_PLAYER_KEY] = {}
    await act(async () => result.current.actions.refreshUnlocks())
    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(1)
    expect(result.current.unlocks.unlockMap).toEqual({ animals: ['lion'] })

    await rerender({ on: true })
    expect(mockGetPuzzleUnlockMap).toHaveBeenCalledTimes(2)
    expect(result.current.unlocks.unlockMap).toEqual({})
  })

  it('hands back the same object until something is read', async () => {
    const { result, rerender } = await renderUnlocks()
    const before = result.current.unlocks

    await rerender({})
    expect(result.current.unlocks).toBe(before)
  })
})

describe('usePlayerPuzzleUnlocks', () => {
  it("reads one player's, or for null every player's together", async () => {
    const one = await renderHook(() => usePlayerPuzzleUnlocks('profile-a'), { wrapper })
    const device = await renderHook(() => usePlayerPuzzleUnlocks(null), { wrapper })

    expect(one.result.current.unlockMap).toEqual({ animals: ['tiger'] })
    expect(device.result.current).toEqual({ unlockMap: { device: ['all'] }, loaded: true })
    expect(mockGetDevicePuzzleUnlockMap).toHaveBeenCalledTimes(1)
  })
})
