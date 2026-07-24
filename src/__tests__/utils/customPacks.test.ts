import { buildCustomPuzzle, deleteCustomPack, exportCustomPack, getCustomPackPuzzles, getCustomPacks, getCustomPackSummaries, getCustomPacksVersion, getStoredCustomPacks, importCustomPack, isCustomPackKey, loadCustomPacksCache, MAX_ENTRIES_PER_PACK, saveCustomPack } from '@/utils/customPacks'

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

beforeEach(async () => {
  mockStore = {}
  await loadCustomPacksCache()
})

describe('isCustomPackKey', () => {
  it('recognizes a custom-pack key', () => {
    expect(isCustomPackKey('custom:abc123')).toBe(true)
  })

  it('rejects a built-in pack key', () => {
    expect(isCustomPackKey('bands')).toBe(false)
  })
})

describe('buildCustomPuzzle', () => {
  it('returns null for a blank answer', () => {
    expect(buildCustomPuzzle('custom:1', 'My Pack', { answer: '   ' }, 0)).toBeNull()
  })

  it('returns null for an all-punctuation answer', () => {
    expect(buildCustomPuzzle('custom:1', 'My Pack', { answer: '!!! 123' }, 0)).toBeNull()
  })

  it('scores a low-letter-diversity word as hard (few unique letters means many guaranteed misses)', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' }, 0)

    expect(puzzle?.difficultyTier).toBe('hard')
    expect(puzzle?.normalizedAnswer).toBe('CAT')
    expect(puzzle?.wordCount).toBe(1)
    expect(puzzle?.letterCount).toBe(3)
    expect(puzzle?.uniqueLetterCount).toBe(3)
  })

  it('scores a phrase with broad alphabet coverage as easy, even with unusual letters', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'quixotic jazz vortex' }, 0)

    expect(puzzle?.difficultyTier).toBe('easy')
  })

  it('sets metadata.hint when a hint is given', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat', hint: 'A pet' }, 0)

    expect(puzzle?.metadata).toEqual({ hint: 'A pet' })
  })

  it('leaves metadata undefined when no hint is given', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' }, 0)

    expect(puzzle?.metadata).toBeUndefined()
  })

  it('sets source to custom and category to the pack label', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' }, 0)

    expect(puzzle?.source).toBe('custom')
    expect(puzzle?.category).toBe('My Pack')
  })
})

describe('saveCustomPack', () => {
  it('creates a new pack with a generated custom: key and persists it', async () => {
    const pack = await saveCustomPack({ label: 'Movies I Like', entries: [{ answer: 'inception' }, { answer: 'arrival' }] })

    expect(isCustomPackKey(pack.key)).toBe(true)
    expect(pack.puzzles).toHaveLength(2)

    const stored = await getStoredCustomPacks()
    expect(stored).toHaveLength(1)
    expect(stored[0].key).toBe(pack.key)
  })

  it('drops entries that fail to normalize', async () => {
    const pack = await saveCustomPack({ label: 'X', entries: [{ answer: 'cat' }, { answer: '!!!' }] })

    expect(pack.puzzles).toHaveLength(1)
    expect(pack.puzzles[0].answer).toBe('cat')
  })

  it('truncates entries beyond the per-pack cap', async () => {
    const entries = Array.from({ length: MAX_ENTRIES_PER_PACK + 5 }, (_, i) => ({ answer: `word${i}` }))
    const pack = await saveCustomPack({ label: 'Big', entries })

    expect(pack.puzzles).toHaveLength(MAX_ENTRIES_PER_PACK)
  })

  it('bumps the version counter on every save', async () => {
    const before = getCustomPacksVersion()
    await saveCustomPack({ label: 'A', entries: [{ answer: 'cat' }] })

    expect(getCustomPacksVersion()).toBe(before + 1)
  })

  it('reuses the same key and preserves createdAt when editing an existing pack', async () => {
    const created = await saveCustomPack({ label: 'A', entries: [{ answer: 'cat' }] })
    const edited = await saveCustomPack({ key: created.key, label: 'A', entries: [{ answer: 'dog' }] })

    expect(edited.key).toBe(created.key)
    expect(edited.createdAt).toBe(created.createdAt)
    expect(edited.puzzles).toHaveLength(1)
    expect(edited.puzzles[0].answer).toBe('dog')

    const stored = await getStoredCustomPacks()
    expect(stored).toHaveLength(1)
  })

  it('updates the in-memory cache readable via getCustomPacks/getCustomPackSummaries/getCustomPackPuzzles', async () => {
    const pack = await saveCustomPack({ label: 'My Pack', entries: [{ answer: 'cat' }] })

    expect(getCustomPacks()).toHaveLength(1)

    const summaries = getCustomPackSummaries()
    expect(summaries).toEqual([{ key: pack.key, file: '', label: 'My Pack', count: 1, difficultyTiers: ['hard'], sources: ['custom'], categories: ['My Pack'] }])

    expect(getCustomPackPuzzles(pack.key)).toHaveLength(1)
    expect(getCustomPackPuzzles('custom:nonexistent')).toEqual([])
  })
})

describe('deleteCustomPack', () => {
  it('removes the pack from storage and the in-memory cache', async () => {
    const pack = await saveCustomPack({ label: 'A', entries: [{ answer: 'cat' }] })
    await deleteCustomPack(pack.key)

    expect(getCustomPacks()).toHaveLength(0)
    expect(await getStoredCustomPacks()).toHaveLength(0)
  })

  it('bumps the version counter', async () => {
    const pack = await saveCustomPack({ label: 'A', entries: [{ answer: 'cat' }] })
    const before = getCustomPacksVersion()
    await deleteCustomPack(pack.key)

    expect(getCustomPacksVersion()).toBe(before + 1)
  })
})

describe('exportCustomPack / importCustomPack', () => {
  it('returns null when exporting an unknown key', async () => {
    expect(await exportCustomPack('custom:nonexistent')).toBeNull()
  })

  it('round-trips a pack through export and import with a fresh key', async () => {
    const pack = await saveCustomPack({ label: 'Shareable', entries: [{ answer: 'cat', hint: 'A pet' }] })
    const exported = await exportCustomPack(pack.key)
    expect(exported).not.toBeNull()

    const imported = await importCustomPack(exported as string)

    expect(imported.key).not.toBe(pack.key)
    expect(imported.label).toBe('Shareable')
    expect(imported.puzzles[0].answer).toBe('cat')
    expect(imported.puzzles[0].metadata).toEqual({ hint: 'A pet' })
    expect(getCustomPacks()).toHaveLength(2)
  })

  it('rejects invalid JSON', async () => {
    await expect(importCustomPack('not json')).rejects.toThrow()
  })

  it('rejects a payload missing the expected pack shape', async () => {
    await expect(importCustomPack(JSON.stringify({ foo: 'bar' }))).rejects.toThrow()
  })
})
