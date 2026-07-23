import { clearPuzzleUnlocks, exportPuzzleUnlocks, getPuzzleUnlockMap, getTotalUnlockedCount, getUnlockedCountForPack, importPuzzleUnlocks, markPuzzleUnlocked, mergePuzzleUnlocks } from '@/utils/unlocks'

let mockStore: Record<string, string>

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value
    return Promise.resolve(null)
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStore[key]
    return Promise.resolve(null)
  })
}))

const PUZZLE_UNLOCKS_KEY = 'puzzle_unlocks_v1'

beforeEach(() => {
  mockStore = {}
})

describe('markPuzzleUnlocked', () => {
  it('returns true and persists on first unlock for a packKey+puzzleId', async () => {
    const result = await markPuzzleUnlocked('animals', 'lion')

    expect(result).toBe(true)

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({ animals: ['lion'] })
  })

  it('returns false when the exact same packKey+puzzleId is already unlocked', async () => {
    await markPuzzleUnlocked('animals', 'lion')
    const result = await markPuzzleUnlocked('animals', 'lion')

    expect(result).toBe(false)

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({ animals: ['lion'] })
  })

  it('returns false without touching storage when packKey is empty', async () => {
    const result = await markPuzzleUnlocked('', 'lion')

    expect(result).toBe(false)
    expect(mockStore[PUZZLE_UNLOCKS_KEY]).toBeUndefined()
  })

  it('returns false without touching storage when puzzleId is empty', async () => {
    const result = await markPuzzleUnlocked('animals', '')

    expect(result).toBe(false)
    expect(mockStore[PUZZLE_UNLOCKS_KEY]).toBeUndefined()
  })
})

describe('getPuzzleUnlockMap', () => {
  it('returns {} when storage is empty', async () => {
    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({})
  })

  it('returns the previously-stored map after a markPuzzleUnlocked call', async () => {
    await markPuzzleUnlocked('animals', 'lion')
    await markPuzzleUnlocked('animals', 'tiger')

    const map = await getPuzzleUnlockMap()
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
  })

  it('returns {} (not a throw) when the stored value is corrupted JSON', async () => {
    mockStore[PUZZLE_UNLOCKS_KEY] = '{not valid json'

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({})
  })

  it('normalizes away a valid-JSON but invalid shape (array instead of object) rather than crashing', async () => {
    mockStore[PUZZLE_UNLOCKS_KEY] = JSON.stringify(['lion', 'tiger'])

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({})
  })
})

describe('exportPuzzleUnlocks', () => {
  it('returns a JSON string with version 1, exportedAt, and the unlocked puzzles', async () => {
    await markPuzzleUnlocked('animals', 'lion')
    await markPuzzleUnlocked('countries', 'france')

    const raw = await exportPuzzleUnlocks()
    const parsed = JSON.parse(raw)

    expect(parsed.version).toBe(1)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.unlocks).toEqual({
      animals: ['lion'],
      countries: ['france']
    })
  })
})

describe('importPuzzleUnlocks', () => {
  it('replaces whatever was there before (hard overwrite)', async () => {
    await markPuzzleUnlocked('animals', 'lion')

    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      unlocks: { countries: ['france', 'spain'] }
    })

    const result = await importPuzzleUnlocks(payload)

    expect(result.importedCount).toBe(2)

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({ countries: ['france', 'spain'] })
  })

  it('accepts a full export-payload shape and returns the correct importedCount across packs', async () => {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      unlocks: { animals: ['lion', 'tiger'], countries: ['france'] }
    })

    const result = await importPuzzleUnlocks(payload)

    expect(result.importedCount).toBe(3)

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({ animals: ['lion', 'tiger'], countries: ['france'] })
  })

  it('accepts a bare unlocks-map shape directly', async () => {
    const payload = JSON.stringify({ animals: ['lion'], countries: ['france', 'spain'] })

    const result = await importPuzzleUnlocks(payload)

    expect(result.importedCount).toBe(3)

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({ animals: ['lion'], countries: ['france', 'spain'] })
  })
})

describe('mergePuzzleUnlocks', () => {
  it('adds only genuinely new ids, keeps importedCount as the incoming total regardless of overlap, and unions with existing state instead of clobbering it', async () => {
    await markPuzzleUnlocked('animals', 'lion')
    await markPuzzleUnlocked('countries', 'japan')

    const payload = JSON.stringify({
      unlocks: {
        animals: ['lion', 'tiger']
      }
    })

    const result = await mergePuzzleUnlocks(payload)

    expect(result.importedCount).toBe(2)
    expect(result.addedCount).toBe(1)

    const map = await getPuzzleUnlockMap()
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
    expect(map.countries).toEqual(['japan'])
  })

  it('accepts a bare unlocks-map shape directly', async () => {
    await markPuzzleUnlocked('animals', 'lion')

    const payload = JSON.stringify({ animals: ['tiger'] })

    const result = await mergePuzzleUnlocks(payload)

    expect(result.importedCount).toBe(1)
    expect(result.addedCount).toBe(1)

    const map = await getPuzzleUnlockMap()
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
  })
})

describe('clearPuzzleUnlocks', () => {
  it('clears storage so getPuzzleUnlockMap returns {} again', async () => {
    await markPuzzleUnlocked('animals', 'lion')

    await clearPuzzleUnlocks()

    const map = await getPuzzleUnlockMap()
    expect(map).toEqual({})
  })
})

describe('getUnlockedCountForPack', () => {
  it('returns the count of ids for a pack that is present', () => {
    const map = { animals: ['lion', 'tiger', 'bear'], countries: ['france'] }
    expect(getUnlockedCountForPack(map, 'animals')).toBe(3)
  })

  it('returns 0 for a pack key not present in the map, without throwing', () => {
    const map = { animals: ['lion'] }
    expect(getUnlockedCountForPack(map, 'countries')).toBe(0)
  })
})

describe('getTotalUnlockedCount', () => {
  it('returns the total count across multiple packs', () => {
    const map = { animals: ['lion', 'tiger', 'bear'], countries: ['france'], colors: [] }
    expect(getTotalUnlockedCount(map)).toBe(4)
  })

  it('returns 0 for an empty map', () => {
    expect(getTotalUnlockedCount({})).toBe(0)
  })
})
