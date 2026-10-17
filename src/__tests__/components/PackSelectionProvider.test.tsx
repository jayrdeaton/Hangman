import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { PackSelectionProvider } from '@/components/PackSelectionProvider'
import { CatalogProvider, useCatalogActions } from '@/hooks/useCatalog'
import { usePackSelection } from '@/hooks/usePackSelection'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import type { PuzzleManifestItem } from '@/utils/puzzleCatalog'

// A small manifest the tests can grow, standing in for a custom pack arriving after launch.
const pack = (key: string, count = 3): PuzzleManifestItem => ({ key, label: key, count }) as PuzzleManifestItem
let mockManifest: PuzzleManifestItem[] = []
jest.mock('@/utils/puzzleCatalog', () => ({
  ...jest.requireActual('@/utils/puzzleCatalog'),
  getPuzzleManifest: jest.fn(() => mockManifest)
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <CatalogProvider>
      <PackSelectionProvider>{children}</PackSelectionProvider>
    </CatalogProvider>
  </ReduxProvider>
)

const renderSelection = () => renderHook(() => ({ selection: usePackSelection(), catalog: useCatalogActions() }), { wrapper })
const storedPackKeys = (playerKey = GUEST_PLAYER_KEY) => store.getState().playerSettings[playerKey]?.packKeys

describe('PackSelectionProvider', () => {
  beforeEach(() => {
    mockManifest = [pack('animals'), pack('movies'), pack('empty', 0)]
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
  })

  // Nothing to wait for: the selection is in redux, rehydrated before anything renders.
  it('is every pack with a puzzle in it for a player who never chose, ready at once', async () => {
    const { result } = await renderSelection()

    expect(result.current.selection).toMatchObject({ selectedPackKeys: ['animals', 'movies'], ready: true })
  })

  it("saves a selection with a pack off as the active player's", async () => {
    const { result } = await renderSelection()

    await act(async () => result.current.selection.setSelectedPackKeys(['movies']))

    expect(result.current.selection.selectedPackKeys).toEqual(['movies'])
    expect(storedPackKeys()).toEqual(['movies'])
  })

  // Stored as "every pack", so a custom pack made or loaded later is in without anyone switching it on.
  it('saves a selection with every pack on as every pack, whatever its order', async () => {
    const { result } = await renderSelection()
    await act(async () => result.current.selection.setSelectedPackKeys(['movies']))

    await act(async () => result.current.selection.setSelectedPackKeys(['movies', 'animals']))

    expect(storedPackKeys()).toBeNull()
    expect(result.current.selection.selectedPackKeys).toEqual(['animals', 'movies'])
  })

  it('takes a pack that arrives later into every pack, but not into a selection with a pack off', async () => {
    const { result } = await renderSelection()

    mockManifest = [...mockManifest, pack('custom:abc')]
    await act(async () => result.current.catalog.refreshCustomPacks())
    expect(result.current.selection.selectedPackKeys).toEqual(['animals', 'movies', 'custom:abc'])

    await act(async () => result.current.selection.setSelectedPackKeys(['animals']))
    mockManifest = [...mockManifest, pack('custom:def')]
    await act(async () => result.current.catalog.refreshCustomPacks())
    expect(result.current.selection.selectedPackKeys).toEqual(['animals'])
  })

  it("doesn't write anything when every pack is chosen again", async () => {
    const { result } = await renderSelection()
    const before = store.getState().playerSettings

    await act(async () => result.current.selection.setSelectedPackKeys(['animals', 'movies']))

    expect(store.getState().playerSettings).toBe(before)
  })

  it("switches to the new player's selection when the player changes", async () => {
    store.dispatch(playerSettingsActions.setPackKeys({ playerKey: 'profile-a', packKeys: ['animals'] }))
    const { result } = await renderSelection()
    expect(result.current.selection.selectedPackKeys).toEqual(['animals', 'movies'])

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })

    expect(result.current.selection.selectedPackKeys).toEqual(['animals'])
  })

  // The loadouts' memoized drawers take these as props.
  it('hands back the same value until the selection changes', async () => {
    const { result, rerender } = await renderSelection()
    const before = result.current.selection

    await rerender({})
    await act(async () => {
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: 'profile-a', packKeys: ['movies'] }))
    })

    expect(result.current.selection).toBe(before)
  })
})
