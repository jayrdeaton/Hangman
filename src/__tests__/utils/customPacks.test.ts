import { addCustomPuzzle, buildCustomPuzzle, CUSTOM_QUICK_PACK_LABEL, deleteCustomPack, exportCustomPack, getCustomPackPuzzles, getCustomPacks, getCustomPackSummaries, getCustomPacksVersion, getStoredCustomPacks, importCustomPack, isCustomPackKey, loadCustomPacksCache, saveCustomPack } from '@/utils/customPacks'

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
    expect(buildCustomPuzzle('custom:1', 'My Pack', { answer: '   ' })).toBeNull()
  })

  it('returns null for an all-punctuation answer', () => {
    expect(buildCustomPuzzle('custom:1', 'My Pack', { answer: '!!! 123' })).toBeNull()
  })

  it('scores a low-letter-diversity word as hard (few unique letters means many guaranteed misses)', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' })

    expect(puzzle?.difficultyTier).toBe('hard')
    expect(puzzle?.normalizedAnswer).toBe('CAT')
    expect(puzzle?.wordCount).toBe(1)
    expect(puzzle?.letterCount).toBe(3)
    expect(puzzle?.uniqueLetterCount).toBe(3)
  })

  it('scores a phrase with broad alphabet coverage as easy, even with unusual letters', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'quixotic jazz vortex' })

    expect(puzzle?.difficultyTier).toBe('easy')
  })

  it('sets metadata.hint when a hint is given', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat', hint: 'A pet' })

    expect(puzzle?.metadata).toEqual({ hint: 'A pet' })
  })

  it('leaves metadata undefined when no hint is given', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' })

    expect(puzzle?.metadata).toBeUndefined()
  })

  it('sets source to custom and category to the pack label', () => {
    const puzzle = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' })

    expect(puzzle?.source).toBe('custom')
    expect(puzzle?.category).toBe('My Pack')
  })

  it('derives id from the answer content, not position, so reordering never changes it', () => {
    const first = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' })
    const second = buildCustomPuzzle('custom:1', 'My Pack', { answer: 'dog' })

    // Same answer, same pack -> same id regardless of where it appears in the entry list.
    expect(buildCustomPuzzle('custom:1', 'My Pack', { answer: 'cat' })?.id).toBe(first?.id)
    expect(first?.id).not.toBe(second?.id)
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

  it('does not truncate large packs (no per-pack entry cap)', async () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({ answer: `word${i}` }))
    const pack = await saveCustomPack({ label: 'Big', entries })

    expect(pack.puzzles).toHaveLength(250)
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

describe('addCustomPuzzle', () => {
  it('creates the Custom pack on the first call', async () => {
    const pack = await addCustomPuzzle({ answer: 'cat', hint: 'A pet' })

    expect(pack.label).toBe(CUSTOM_QUICK_PACK_LABEL)
    expect(isCustomPackKey(pack.key)).toBe(true)
    expect(pack.puzzles).toHaveLength(1)
    expect(pack.puzzles[0].answer).toBe('cat')
  })

  it('appends to the same Custom pack on later calls, keeping earlier entries', async () => {
    const first = await addCustomPuzzle({ answer: 'cat' })
    const second = await addCustomPuzzle({ answer: 'dog' })

    expect(second.key).toBe(first.key)
    expect(second.puzzles.map((puzzle) => puzzle.answer)).toEqual(['cat', 'dog'])

    const stored = await getStoredCustomPacks()
    expect(stored.filter((pack) => pack.label === CUSTOM_QUICK_PACK_LABEL)).toHaveLength(1)
  })

  it('replaces the existing entry (rather than duplicating it) when the same word is added again', async () => {
    await addCustomPuzzle({ answer: 'cat', hint: 'Old hint' })
    const pack = await addCustomPuzzle({ answer: 'CAT', hint: 'New hint' })

    expect(pack.puzzles).toHaveLength(1)
    expect(pack.puzzles[0].metadata).toEqual({ hint: 'New hint' })
  })

  it('does not disturb an unrelated custom pack that also happens to contain the same word', async () => {
    const other = await saveCustomPack({ label: 'My Own Pack', entries: [{ answer: 'cat' }] })
    const custom = await addCustomPuzzle({ answer: 'cat' })

    expect(custom.key).not.toBe(other.key)
    expect(getCustomPackPuzzles(other.key)).toHaveLength(1)
    expect(getCustomPacks().filter((pack) => pack.label === 'My Own Pack')).toHaveLength(1)
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

  it('round-trips a pack through export and import, reusing the same key', async () => {
    const pack = await saveCustomPack({ label: 'Shareable', entries: [{ answer: 'cat', hint: 'A pet' }] })
    const exported = await exportCustomPack(pack.key)
    expect(exported).not.toBeNull()

    const imported = await importCustomPack(exported as string)

    // Re-importing your own export is an update, not a duplicate: same key, still one pack.
    expect(imported.key).toBe(pack.key)
    expect(imported.label).toBe('Shareable')
    expect(imported.puzzles[0].answer).toBe('cat')
    expect(imported.puzzles[0].metadata).toEqual({ hint: 'A pet' })
    expect(getCustomPacks()).toHaveLength(1)
  })

  it('imports an external payload using its own key rather than minting a random one', async () => {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      pack: { key: 'custom:studio-ghibli', label: 'Studio Ghibli', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', puzzles: [{ id: 'x', source: 'custom', type: 'phrase', answer: 'Totoro', normalizedAnswer: 'TOTORO', category: 'Studio Ghibli', difficulty: 0, difficultyTier: 'easy', wordCount: 1, letterCount: 6, uniqueLetterCount: 4 }] }
    })

    const imported = await importCustomPack(payload)

    expect(imported.key).toBe('custom:studio-ghibli')
  })

  it('merges an updated re-import in place: unchanged entries keep their id, new entries are added, no duplicate pack is created', async () => {
    const v1 = JSON.stringify({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      pack: { key: 'custom:studio-ghibli', label: 'Studio Ghibli', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', puzzles: [{ id: 'x', source: 'custom', type: 'phrase', answer: 'Totoro', normalizedAnswer: 'TOTORO', category: 'Studio Ghibli', difficulty: 0, difficultyTier: 'easy', wordCount: 1, letterCount: 6, uniqueLetterCount: 4 }] }
    })
    const first = await importCustomPack(v1)
    const totoroId = first.puzzles[0].id

    // A later regeneration adds "Kiki" and keeps "Totoro" -- simulates the private scraper repo
    // pushing an update with new entries.
    const v2 = JSON.stringify({
      version: 1,
      exportedAt: '2026-02-01T00:00:00.000Z',
      pack: {
        key: 'custom:studio-ghibli',
        label: 'Studio Ghibli',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        puzzles: [
          { id: 'x', source: 'custom', type: 'phrase', answer: 'Kiki', normalizedAnswer: 'KIKI', category: 'Studio Ghibli', difficulty: 0, difficultyTier: 'easy', wordCount: 1, letterCount: 4, uniqueLetterCount: 3 },
          { id: 'x', source: 'custom', type: 'phrase', answer: 'Totoro', normalizedAnswer: 'TOTORO', category: 'Studio Ghibli', difficulty: 0, difficultyTier: 'easy', wordCount: 1, letterCount: 6, uniqueLetterCount: 4 }
        ]
      }
    })
    const second = await importCustomPack(v2)

    expect(second.key).toBe(first.key)
    expect(getCustomPacks()).toHaveLength(1)
    expect(second.puzzles).toHaveLength(2)
    expect(second.puzzles.find((p) => p.answer === 'Totoro')?.id).toBe(totoroId)
    expect(second.puzzles.find((p) => p.answer === 'Kiki')?.id).not.toBe(totoroId)
  })

  it('rejects invalid JSON', async () => {
    await expect(importCustomPack('not json')).rejects.toThrow()
  })

  it('rejects a payload missing the expected pack shape', async () => {
    await expect(importCustomPack(JSON.stringify({ foo: 'bar' }))).rejects.toThrow()
  })
})
