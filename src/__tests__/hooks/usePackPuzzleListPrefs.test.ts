import { act, renderHook, waitFor } from '@testing-library/react-native'

import { usePackPuzzleListPrefs } from '@/hooks/usePackPuzzleListPrefs'

let mockStore: Record<string, string>
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value
    return Promise.resolve(null)
  })
}))

const STORAGE_KEY = 'packPuzzleListPrefs'

describe('usePackPuzzleListPrefs', () => {
  beforeEach(() => {
    mockStore = {}
  })

  it('starts on the "all / all" default before anything is persisted', async () => {
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    expect(result.current.prefs).toEqual({ statusFilter: 'all', difficultyFilter: 'all' })
  })

  it('loads a previously persisted preference from storage', async () => {
    mockStore[STORAGE_KEY] = JSON.stringify({ statusFilter: 'unsolved', difficultyFilter: 'hard' })
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    await waitFor(() => expect(result.current.prefs).toEqual({ statusFilter: 'unsolved', difficultyFilter: 'hard' }))
  })

  it('ignores a corrupted stored value and falls back to the default', async () => {
    mockStore[STORAGE_KEY] = '{ not valid json'
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    // Nothing to await here — an invalid value never overwrites the initial state, so there's no
    // later change to wait for.
    expect(result.current.prefs).toEqual({ statusFilter: 'all', difficultyFilter: 'all' })
  })

  it('ignores a stored value shaped like something else entirely', async () => {
    mockStore[STORAGE_KEY] = JSON.stringify({ statusFilter: 'not-a-real-status', difficultyFilter: 'all' })
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    expect(result.current.prefs).toEqual({ statusFilter: 'all', difficultyFilter: 'all' })
  })

  it('updates just the given field, leaving the rest of the preference untouched', async () => {
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    await act(async () => result.current.setPrefs({ difficultyFilter: 'easy' }))

    expect(result.current.prefs).toEqual({ statusFilter: 'all', difficultyFilter: 'easy' })
  })

  it('persists an update to storage so it survives past this hook instance', async () => {
    const { result } = await renderHook(() => usePackPuzzleListPrefs())

    await act(async () => result.current.setPrefs({ statusFilter: 'solved' }))

    await waitFor(() => expect(JSON.parse(mockStore[STORAGE_KEY])).toEqual({ statusFilter: 'solved', difficultyFilter: 'all' }))
  })
})
