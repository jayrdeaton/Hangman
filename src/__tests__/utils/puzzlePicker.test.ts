import type { GameMode } from '@/types/gameModes'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { normalizePhrase, type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'

jest.mock('@/utils/puzzleCatalog', () => ({
  getPuzzleManifest: jest.fn(),
  getPuzzlesForCategory: jest.fn()
}))

const mockGetPuzzleManifest = getPuzzleManifest as jest.Mock
const mockGetPuzzlesForCategory = getPuzzlesForCategory as jest.Mock

const fakeMode: GameMode = {
  id: 'classic',
  label: 'Classic',
  description: 'Classic hangman',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: (() => null) as unknown as GameMode['Visual']
}

const baseConfig: PuzzleConfig = {
  sourceMode: 'custom',
  difficulty: 'any',
  packKey: '',
  mode: fakeMode,
  customPhrase: '',
  customHint: ''
}

describe('normalizePhrase', () => {
  it('strips punctuation and numbers', () => {
    expect(normalizePhrase('Hello, World! 123')).toBe('HELLO WORLD')
  })

  it('collapses repeated internal whitespace', () => {
    expect(normalizePhrase('too    many   spaces')).toBe('TOO MANY SPACES')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizePhrase('   padded phrase   ')).toBe('PADDED PHRASE')
  })

  it('uppercases mixed case input', () => {
    expect(normalizePhrase('MiXeD CaSe')).toBe('MIXED CASE')
  })

  it('returns an empty string for an all-non-letter input', () => {
    expect(normalizePhrase('123 456 !@#')).toBe('')
  })
})

describe('resolvePuzzle - custom source mode', () => {
  it('returns ok:true with the normalized phrase for a valid custom phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.phrase).toBe('HELLO WORLD')
      expect(result.payload.sourceMode).toBe('custom')
      expect(result.payload.mode).toBe(fakeMode)
    }
  })

  it('returns ok:false for an empty phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false for a whitespace-only phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '     ' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false for an all-punctuation phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '!!! 123 ???' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('sets payload.hint when a hint is provided', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: 'a greeting' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('a greeting')
  })

  it('leaves payload.hint undefined when the hint is omitted', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: '' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBeUndefined()
  })

  it('leaves payload.hint undefined when the hint is only whitespace', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: '   ' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBeUndefined()
  })
})

describe('resolvePuzzle - category source mode', () => {
  const fakeManifest = [
    {
      key: 'bands',
      file: 'bands.json',
      label: 'Bands',
      count: 2,
      difficultyTiers: ['easy', 'medium'] as const,
      sources: [] as string[],
      categories: [] as string[]
    }
  ]

  const fakePuzzle = {
    id: 'bands-1',
    source: 'music-band',
    type: 'band',
    answer: 'The Beatles',
    normalizedAnswer: 'THE BEATLES',
    category: 'Classic Rock',
    difficulty: 1,
    difficultyTier: 'easy' as const,
    wordCount: 2,
    letterCount: 10,
    uniqueLetterCount: 8
  }

  beforeEach(() => {
    mockGetPuzzleManifest.mockReset()
    mockGetPuzzlesForCategory.mockReset()
  })

  it('returns ok:true with pack label/puzzleId/difficultyTier for a valid packKey with matching puzzles', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([fakePuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'bands' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.phrase).toBe('THE BEATLES')
      expect(result.payload.sourceMode).toBe('category')
      expect(result.payload.packKey).toBe('bands')
      expect(result.payload.packLabel).toBe('Bands')
      expect(result.payload.puzzleId).toBe('bands-1')
      expect(result.payload.difficultyTier).toBe('easy')
    }
  })

  it('returns ok:false when the packKey does not exist in the manifest', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([fakePuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'nonexistent' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when no packKey is provided', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([fakePuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: '' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when the pack exists but has no puzzles matching the requested difficulty', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'bands', difficulty: 'hard' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('sets hint to just the pack label when the pack has a single category (avoids a redundant repeat)', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Theme Technology', categories: ['Technology'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'Technology' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'bands' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Theme Technology')
  })

  it('sets hint to "label: humanized category" when the pack has multiple categories', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Wheel', categories: ['food-and-drink', 'what-are-you-doing'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'what-are-you-doing' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'bands' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Wheel: What-Are-You-Doing')
  })

  it('title-cases ALL CAPS categories without altering punctuation, for multi-category packs', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Jeopardy', categories: ['JACK BE HOMONYM-BLE', 'OTHER'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'JACK BE HOMONYM-BLE' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'category', packKey: 'bands' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Jeopardy: Jack Be Homonym-Ble')
  })
})

describe('resolvePuzzle - random source mode', () => {
  const packA = {
    key: 'bands',
    file: 'bands.json',
    label: 'Bands',
    count: 2,
    difficultyTiers: ['easy', 'medium'] as const,
    sources: [] as string[],
    categories: [] as string[]
  }

  const packB = {
    key: 'movies',
    file: 'movies.json',
    label: 'Movies',
    count: 3,
    difficultyTiers: ['easy', 'hard'] as const,
    sources: [] as string[],
    categories: [] as string[]
  }

  const bandPuzzle = {
    id: 'bands-1',
    source: 'music-band',
    type: 'band',
    answer: 'The Beatles',
    normalizedAnswer: 'THE BEATLES',
    category: 'Classic Rock',
    difficulty: 1,
    difficultyTier: 'easy' as const,
    wordCount: 2,
    letterCount: 10,
    uniqueLetterCount: 8
  }

  const moviePuzzle = {
    id: 'movies-1',
    source: 'movie',
    type: 'title',
    answer: 'Jurassic Park',
    normalizedAnswer: 'JURASSIC PARK',
    category: 'Adventure',
    difficulty: 2,
    difficultyTier: 'easy' as const,
    wordCount: 2,
    letterCount: 12,
    uniqueLetterCount: 10
  }

  beforeEach(() => {
    mockGetPuzzleManifest.mockReset()
    mockGetPuzzlesForCategory.mockReset()
  })

  it('picks a puzzle successfully from the eligible packs', () => {
    mockGetPuzzleManifest.mockReturnValue([packA, packB])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return [bandPuzzle]
      if (key === 'movies') return [moviePuzzle]
      return []
    })

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(['THE BEATLES', 'JURASSIC PARK']).toContain(result.payload.phrase)
      expect(result.payload.sourceMode).toBe('random')
      expect(['bands', 'movies']).toContain(result.payload.packKey)
    }
  })

  it('picks deterministically when only one pack is eligible', () => {
    mockGetPuzzleManifest.mockReturnValue([packA, packB])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return [bandPuzzle]
      return []
    })

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.packKey).toBe('bands')
      expect(result.payload.phrase).toBe('THE BEATLES')
      expect(result.payload.puzzleId).toBe('bands-1')
    }
  })

  it('narrows candidate packs by difficulty tier, still succeeding when one pack qualifies', () => {
    mockGetPuzzleManifest.mockReturnValue([packA, packB])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return [bandPuzzle]
      if (key === 'movies') return [moviePuzzle]
      return []
    })

    // Only packB's difficultyTiers includes 'hard', so it is the sole eligible pack.
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random', difficulty: 'hard' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.packKey).toBe('movies')
  })

  it('returns ok:false when no pack qualifies for the requested difficulty at all', () => {
    mockGetPuzzleManifest.mockReturnValue([packA])
    mockGetPuzzlesForCategory.mockReturnValue([bandPuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random', difficulty: 'hard' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when the manifest has no packs with puzzles', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...packA, count: 0 }])
    mockGetPuzzlesForCategory.mockReturnValue([])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})
