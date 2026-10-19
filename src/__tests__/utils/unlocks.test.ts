import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'
import { clearAllPuzzleUnlocks, clearLeftGuestSeatUnlocks, clearPuzzleUnlocks, exportPuzzleUnlocks, getCompletedBuiltInPackKeys, getDevicePuzzleUnlockMap, getPuzzleUnlockMap, getTotalUnlockedCount, getUnlockedCountForPack, importPuzzleUnlocks, markPuzzleUnlocked, mergePuzzleUnlocks, parseProgressBackup } from '@/utils/unlocks'

import { puzzleManifest } from '../../data/puzzleCatalog.generated'

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
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStore)))
}))

// Every function here is the guest's unless a test says otherwise: one player's puzzles, under its key.
const PLAYER = GUEST_PLAYER_KEY
const OTHER = 'profile-a'
const PUZZLE_UNLOCKS_KEY = `hangman:puzzle_unlocks_v1:${PLAYER}`

beforeEach(() => {
  mockStore = {}
})

describe('markPuzzleUnlocked', () => {
  it('returns true and persists on first unlock for a packKey+puzzleId', async () => {
    const result = await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    expect(result).toBe(true)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({ animals: ['lion'] })
  })

  it('returns false when the exact same packKey+puzzleId is already unlocked', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    const result = await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    expect(result).toBe(false)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({ animals: ['lion'] })
  })

  it('returns false without touching storage when packKey is empty', async () => {
    const result = await markPuzzleUnlocked(PLAYER, '', 'lion')

    expect(result).toBe(false)
    expect(mockStore[PUZZLE_UNLOCKS_KEY]).toBeUndefined()
  })

  it('returns false without touching storage when puzzleId is empty', async () => {
    const result = await markPuzzleUnlocked(PLAYER, 'animals', '')

    expect(result).toBe(false)
    expect(mockStore[PUZZLE_UNLOCKS_KEY]).toBeUndefined()
  })
})

describe('getPuzzleUnlockMap', () => {
  it('returns {} when storage is empty', async () => {
    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({})
  })

  it('returns the previously-stored map after a markPuzzleUnlocked call', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(PLAYER, 'animals', 'tiger')

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
  })

  it('returns {} (not a throw) when the stored value is corrupted JSON', async () => {
    mockStore[PUZZLE_UNLOCKS_KEY] = '{not valid json'

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({})
  })

  it('normalizes away a valid-JSON but invalid shape (array instead of object) rather than crashing', async () => {
    mockStore[PUZZLE_UNLOCKS_KEY] = JSON.stringify(['lion', 'tiger'])

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({})
  })
})

describe('exportPuzzleUnlocks', () => {
  it('returns a JSON string with version 1, exportedAt, and the unlocked puzzles', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(PLAYER, 'countries', 'france')

    const raw = await exportPuzzleUnlocks(PLAYER)
    const parsed = JSON.parse(raw)

    expect(parsed.version).toBe(1)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.unlocks).toEqual({
      animals: ['lion'],
      countries: ['france']
    })
  })
})

describe('parseProgressBackup', () => {
  it('reads the unlocks map out of a full export-payload shape', () => {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      unlocks: { animals: ['lion', 'tiger'], countries: ['france'] }
    })

    expect(parseProgressBackup(payload)).toEqual({ animals: ['lion', 'tiger'], countries: ['france'] })
  })

  // Unlike importPuzzleUnlocks/mergePuzzleUnlocks, a bare unlocks-map with no wrapper key is
  // rejected - this function's job is telling a progress backup apart from a custom pack file
  // (which has a `pack` key instead), and a bare map is indistinguishable from neither.
  it('rejects a bare unlocks-map shape with no unlocks key', () => {
    const payload = JSON.stringify({ animals: ['lion'] })

    expect(() => parseProgressBackup(payload)).toThrow('Invalid progress backup.')
  })

  it('rejects a custom pack export payload', () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), pack: { key: 'custom:abc', label: 'My Pack', puzzles: [] } })

    expect(() => parseProgressBackup(payload)).toThrow('Invalid progress backup.')
  })

  it('rejects invalid JSON', () => {
    expect(() => parseProgressBackup('not valid json')).toThrow()
  })
})

describe('importPuzzleUnlocks', () => {
  it('replaces whatever was there before (hard overwrite)', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      unlocks: { countries: ['france', 'spain'] }
    })

    const result = await importPuzzleUnlocks(PLAYER, payload)

    expect(result.importedCount).toBe(2)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({ countries: ['france', 'spain'] })
  })

  it('accepts a full export-payload shape and returns the correct importedCount across packs', async () => {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      unlocks: { animals: ['lion', 'tiger'], countries: ['france'] }
    })

    const result = await importPuzzleUnlocks(PLAYER, payload)

    expect(result.importedCount).toBe(3)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({ animals: ['lion', 'tiger'], countries: ['france'] })
  })

  it('accepts a bare unlocks-map shape directly', async () => {
    const payload = JSON.stringify({ animals: ['lion'], countries: ['france', 'spain'] })

    const result = await importPuzzleUnlocks(PLAYER, payload)

    expect(result.importedCount).toBe(3)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({ animals: ['lion'], countries: ['france', 'spain'] })
  })
})

describe('mergePuzzleUnlocks', () => {
  it('adds only genuinely new ids, keeps importedCount as the incoming total regardless of overlap, and unions with existing state instead of clobbering it', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(PLAYER, 'countries', 'japan')

    const payload = JSON.stringify({
      unlocks: {
        animals: ['lion', 'tiger']
      }
    })

    const result = await mergePuzzleUnlocks(PLAYER, payload)

    expect(result.importedCount).toBe(2)
    expect(result.addedCount).toBe(1)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
    expect(map.countries).toEqual(['japan'])
  })

  it('accepts a bare unlocks-map shape directly', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    const payload = JSON.stringify({ animals: ['tiger'] })

    const result = await mergePuzzleUnlocks(PLAYER, payload)

    expect(result.importedCount).toBe(1)
    expect(result.addedCount).toBe(1)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
  })
})

describe('clearPuzzleUnlocks', () => {
  it('clears storage so getPuzzleUnlockMap returns {} again', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    await clearPuzzleUnlocks(PLAYER)

    const map = await getPuzzleUnlockMap(PLAYER)
    expect(map).toEqual({})
  })
})

// A guest seat's unlocked puzzles go with the seat; this catches any left behind, at launch.
describe('clearLeftGuestSeatUnlocks', () => {
  it("clears every guest seat's whose seat has left the table, and nobody else's", async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(OTHER, 'animals', 'tiger')
    await markPuzzleUnlocked(guestSeatKey('p1'), 'animals', 'bear')
    await markPuzzleUnlocked(guestSeatKey('p5'), 'animals', 'wolf')

    await clearLeftGuestSeatUnlocks(new Set([guestSeatKey('p1'), guestSeatKey('p2')]))

    expect(Object.keys(mockStore).sort()).toEqual(['hangman:puzzle_unlocks_v1:guest', 'hangman:puzzle_unlocks_v1:guest-p1', 'hangman:puzzle_unlocks_v1:profile-a'])
  })
})

// Everything belongs to a player (2026-10-17): one player's solves never show as another's.
describe("each player's own unlocked puzzles", () => {
  it('keeps every player under their own key', async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(OTHER, 'animals', 'tiger')

    expect(await getPuzzleUnlockMap(PLAYER)).toEqual({ animals: ['lion'] })
    expect(await getPuzzleUnlockMap(OTHER)).toEqual({ animals: ['tiger'] })
    expect(Object.keys(mockStore).sort()).toEqual(['hangman:puzzle_unlocks_v1:guest', 'hangman:puzzle_unlocks_v1:profile-a'])
  })

  // Each Pass & Play guest seat is a player of its own (2026-10-18).
  it("keeps each guest seat's apart from Single Player's guest's and from each other's", async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(guestSeatKey('p2'), 'animals', 'tiger')

    expect(await getPuzzleUnlockMap(guestSeatKey('p2'))).toEqual({ animals: ['tiger'] })
    expect(await getPuzzleUnlockMap(guestSeatKey('p3'))).toEqual({})
    expect(await getPuzzleUnlockMap(PLAYER)).toEqual({ animals: ['lion'] })
    expect(await getDevicePuzzleUnlockMap()).toEqual({ animals: ['lion', 'tiger'] })
  })

  it('counts a puzzle new for one player even when another already solved it', async () => {
    await markPuzzleUnlocked(OTHER, 'animals', 'lion')

    expect(await markPuzzleUnlocked(PLAYER, 'animals', 'lion')).toBe(true)
  })

  // No migration (the app hadn't shipped): the old single device-wide key is never read or adopted, and
  // neither is a player's key from before every key took the hangman: prefix (see storage.ts).
  it('never reads the old device-wide key or the unprefixed per-player keys', async () => {
    mockStore.puzzle_unlocks_v1 = JSON.stringify({ animals: ['lion'] })
    mockStore[`puzzle_unlocks_v1:${PLAYER}`] = JSON.stringify({ animals: ['tiger'] })

    expect(await getPuzzleUnlockMap(PLAYER)).toEqual({})
    expect(await getDevicePuzzleUnlockMap()).toEqual({})
  })

  it("exports, imports and merges only the player's own", async () => {
    await markPuzzleUnlocked(OTHER, 'countries', 'japan')
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')

    expect(JSON.parse(await exportPuzzleUnlocks(PLAYER)).unlocks).toEqual({ animals: ['lion'] })
    await mergePuzzleUnlocks(PLAYER, JSON.stringify({ unlocks: { animals: ['tiger'] } }))
    await importPuzzleUnlocks(OTHER, JSON.stringify({ unlocks: { colors: ['red'] } }))

    expect(await getPuzzleUnlockMap(PLAYER)).toEqual({ animals: ['lion', 'tiger'] })
    expect(await getPuzzleUnlockMap(OTHER)).toEqual({ colors: ['red'] })
  })

  it("clears one player's, or every player's", async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(OTHER, 'animals', 'tiger')
    mockStore.selectedSomethingElse = 'kept'

    await clearPuzzleUnlocks(OTHER)
    expect(await getPuzzleUnlockMap(PLAYER)).toEqual({ animals: ['lion'] })
    expect(await getPuzzleUnlockMap(OTHER)).toEqual({})

    await markPuzzleUnlocked(OTHER, 'animals', 'tiger')
    await clearAllPuzzleUnlocks()
    expect(Object.keys(mockStore)).toEqual(['selectedSomethingElse'])
  })
})

describe('getDevicePuzzleUnlockMap', () => {
  it("puts every player's unlocked puzzles together, each once", async () => {
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    await markPuzzleUnlocked(PLAYER, 'countries', 'japan')
    await markPuzzleUnlocked(OTHER, 'animals', 'lion')
    await markPuzzleUnlocked(OTHER, 'animals', 'tiger')

    const map = await getDevicePuzzleUnlockMap()
    expect(map.animals?.sort()).toEqual(['lion', 'tiger'])
    expect(map.countries).toEqual(['japan'])
  })

  it('is empty with nothing stored, and skips a corrupt player', async () => {
    expect(await getDevicePuzzleUnlockMap()).toEqual({})

    mockStore[`hangman:puzzle_unlocks_v1:${OTHER}`] = '{not valid json'
    await markPuzzleUnlocked(PLAYER, 'animals', 'lion')
    expect(await getDevicePuzzleUnlockMap()).toEqual({ animals: ['lion'] })
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

describe('getCompletedBuiltInPackKeys', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, i) => `id-${i}`)

  it('lists the built-in packs with every puzzle unlocked, rescanning the whole manifest', () => {
    const [first, second, third] = puzzleManifest
    const map = { [first.key]: ids(first.count), [second.key]: ids(second.count - 1), [third.key]: ids(third.count) }

    expect(getCompletedBuiltInPackKeys(map)).toEqual([first.key, third.key])
  })

  it('never counts a custom pack, however complete', () => {
    expect(getCompletedBuiltInPackKeys({ 'custom:abc': ids(5) })).toEqual([])
  })

  it('finds nothing in an empty map', () => {
    expect(getCompletedBuiltInPackKeys({})).toEqual([])
  })
})
