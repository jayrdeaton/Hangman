import { act, render, renderHook } from '@testing-library/react-native'
import { type ReactNode, useEffect } from 'react'
import { Text } from 'react-native'

import { CatalogProvider, useCatalogActions, useCatalogVersions, useUnlockVersion } from '@/hooks/useCatalog'
import { loadCustomPacksCache } from '@/utils/customPacks'

// The mount-time load reads AsyncStorage (a stub here), so the tests decide when it resolves.
jest.mock('@/utils/customPacks', () => ({
  ...jest.requireActual('@/utils/customPacks'),
  loadCustomPacksCache: jest.fn()
}))
const mockLoadCustomPacksCache = jest.mocked(loadCustomPacksCache)

// A load the test resolves itself, to see what the provider does before and after it lands.
const deferredLoad = () => {
  let resolve!: () => void
  mockLoadCustomPacksCache.mockImplementation(() => new Promise<void>((done) => (resolve = done)))
  return { resolve: () => act(async () => resolve()) }
}

const Wrapper = ({ children }: { children: ReactNode }) => <CatalogProvider>{children}</CatalogProvider>

const renderCatalog = () => renderHook(() => ({ versions: useCatalogVersions(), actions: useCatalogActions() }), { wrapper: Wrapper })

describe('useCatalog', () => {
  beforeEach(() => {
    mockLoadCustomPacksCache.mockReset().mockResolvedValue(undefined)
  })

  // Custom packs live in AsyncStorage, so they reach the pack lists a moment after launch: the bump
  // is what makes every screen re-read them once they're in memory.
  it('loads the custom-pack cache once on mount and bumps packsVersion when it resolves', async () => {
    const load = deferredLoad()
    const { result, rerender } = await renderCatalog()

    expect(mockLoadCustomPacksCache).toHaveBeenCalledTimes(1)
    expect(result.current.versions).toEqual({ unlockVersion: 0, packsVersion: 0 })

    await load.resolve()
    expect(result.current.versions).toEqual({ unlockVersion: 0, packsVersion: 1 })

    // Neither a re-render nor a count moving loads it again.
    await rerender({})
    await act(async () => {
      result.current.actions.refreshCustomPacks()
      result.current.actions.refreshUnlocks()
    })
    expect(mockLoadCustomPacksCache).toHaveBeenCalledTimes(1)
  })

  it('bumps unlockVersion through refreshUnlocks and packsVersion through refreshCustomPacks, each on its own', async () => {
    const { result } = await renderCatalog()
    // The mount-time load has already landed (packsVersion 1).
    expect(result.current.versions).toEqual({ unlockVersion: 0, packsVersion: 1 })

    await act(async () => result.current.actions.refreshUnlocks())
    expect(result.current.versions).toEqual({ unlockVersion: 1, packsVersion: 1 })

    await act(async () => result.current.actions.refreshCustomPacks())
    expect(result.current.versions).toEqual({ unlockVersion: 1, packsVersion: 2 })

    // Every call counts, even several in one batch.
    await act(async () => {
      result.current.actions.refreshUnlocks()
      result.current.actions.refreshUnlocks()
    })
    expect(result.current.versions).toEqual({ unlockVersion: 3, packsVersion: 2 })
  })

  it('never changes the actions object while the counts move, and hands out new versions only when one does', async () => {
    const { result, rerender } = await renderCatalog()
    const actions = result.current.actions
    const versions = result.current.versions

    // A plain re-render keeps both.
    await rerender({})
    expect(result.current.actions).toBe(actions)
    expect(result.current.versions).toBe(versions)

    await act(async () => actions.refreshUnlocks())
    await act(async () => actions.refreshCustomPacks())

    expect(result.current.actions).toBe(actions)
    expect(result.current.actions.refreshUnlocks).toBe(actions.refreshUnlocks)
    expect(result.current.actions.refreshCustomPacks).toBe(actions.refreshCustomPacks)
    expect(result.current.versions).not.toBe(versions)
  })

  // The two counters and the two actions are separate contexts on purpose: the game screen only ever
  // calls the actions, so a win's refreshUnlocks mustn't re-render it.
  it("doesn't re-render a reader of the actions alone when a count moves", async () => {
    // Counted in an effect with no dependencies, which runs once after every render.
    const renders = { actions: 0, versions: 0 }
    let actions: ReturnType<typeof useCatalogActions> | null = null
    const ActionsReader = () => {
      const value = useCatalogActions()
      useEffect(() => {
        renders.actions += 1
        actions = value
      })
      return null
    }
    const VersionsReader = () => {
      const { unlockVersion, packsVersion } = useCatalogVersions()
      useEffect(() => {
        renders.versions += 1
      })
      return <Text testID='versions'>{`${unlockVersion}/${packsVersion}`}</Text>
    }
    const screen = await render(
      <CatalogProvider>
        <ActionsReader />
        <VersionsReader />
      </CatalogProvider>
    )
    const before = { ...renders }

    await act(async () => actions!.refreshUnlocks())
    await act(async () => actions!.refreshCustomPacks())

    expect(screen.getByTestId('versions').props.children).toBe('1/2')
    expect(renders.actions).toBe(before.actions)
    expect(renders.versions).toBe(before.versions + 2)
  })

  // usePuzzleUnlocks reads the unlock counter on its own, so a custom pack saved elsewhere doesn't
  // re-render the memoized drawers that read unlocked puzzles.
  it("hands out the unlock count on its own, which a custom pack change doesn't re-render", async () => {
    let renders = 0
    let actions: ReturnType<typeof useCatalogActions> | null = null
    const UnlockReader = () => {
      const unlockVersion = useUnlockVersion()
      const value = useCatalogActions()
      useEffect(() => {
        renders += 1
        actions = value
      })
      return <Text testID='unlocks'>{String(unlockVersion)}</Text>
    }
    const screen = await render(
      <CatalogProvider>
        <UnlockReader />
      </CatalogProvider>
    )
    const before = renders

    await act(async () => actions!.refreshCustomPacks())
    expect(renders).toBe(before)

    await act(async () => actions!.refreshUnlocks())
    expect(screen.getByTestId('unlocks').props.children).toBe('1')
    expect(renders).toBe(before + 1)
  })

  it('reads zero counts and harmless no-op actions outside a provider', async () => {
    const { result } = await renderHook(() => ({ versions: useCatalogVersions(), actions: useCatalogActions(), unlockVersion: useUnlockVersion() }))

    expect(result.current.versions).toEqual({ unlockVersion: 0, packsVersion: 0 })
    expect(result.current.unlockVersion).toBe(0)
    expect(() => {
      result.current.actions.refreshUnlocks()
      result.current.actions.refreshCustomPacks()
    }).not.toThrow()
    expect(mockLoadCustomPacksCache).not.toHaveBeenCalled()
  })
})
