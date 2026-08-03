import type { GameMode } from '@/types/gameModes'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { normalizePhrase, type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'

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
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world' }, [])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.phrase).toBe('HELLO WORLD')
      expect(result.payload.sourceMode).toBe('custom')
      expect(result.payload.mode).toBe(fakeMode)
    }
  })

  it('returns ok:false for an empty phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '' }, [])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false for a whitespace-only phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '     ' }, [])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false for an all-punctuation phrase', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: '!!! 123 ???' }, [])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('sets payload.hint when a hint is provided', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: 'a greeting' }, [])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('a greeting')
  })

  it('leaves payload.hint undefined when the hint is omitted', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: '' }, [])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBeUndefined()
  })

  it('leaves payload.hint undefined when the hint is only whitespace', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'hello world', customHint: '   ' }, [])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBeUndefined()
  })

  // Without this, the difficulty pill a player watches update live while typing (both in the
  // drawer's own Custom form and pass-and-play's compose screen — both preview via
  // buildCustomPuzzle) would go missing the instant the round actually starts, since Game reads
  // its badge from payload.difficultyTier alone.
  it('sets payload.difficultyTier, scored the same way the live preview scores it', () => {
    // Few distinct letters (only Q, U, E, N) — scoreDifficulty rates this 'hard'. See customPacks.ts.
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'custom', customPhrase: 'queen' }, [])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.difficultyTier).toBe('hard')
  })
})

describe('resolvePuzzle - random source mode, scoped to selected packs', () => {
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

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.phrase).toBe('THE BEATLES')
      expect(result.payload.sourceMode).toBe('random')
      expect(result.payload.packKey).toBe('bands')
      expect(result.payload.packLabel).toBe('Bands')
      expect(result.payload.puzzleId).toBe('bands-1')
      expect(result.payload.difficultyTier).toBe('easy')
      expect(result.payload.packScope).toBe('single')
    }
  })

  it('returns ok:false when none of the selected packKeys exist in the manifest', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([fakePuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['nonexistent'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when no packKeys are selected', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([fakePuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, [])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when the selected packs exist but have no puzzles matching the requested difficulty', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random', difficulty: 'hard' }, ['bands'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('only draws from the selected packKeys, ignoring other packs in the manifest', () => {
    const otherPack = { ...fakeManifest[0], key: 'movies', label: 'Movies' }
    const otherPuzzle = { ...fakePuzzle, id: 'movies-1', answer: 'Jurassic Park', normalizedAnswer: 'JURASSIC PARK' }
    mockGetPuzzleManifest.mockReturnValue([...fakeManifest, otherPack])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return [fakePuzzle]
      if (key === 'movies') return [otherPuzzle]
      return []
    })

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['movies'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.packKey).toBe('movies')
  })

  it('sets hint to just the humanized category, without the pack label', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Technology & Trivia', categories: ['Technology', 'Trivia'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'Technology' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Technology')
  })

  it('omits the hint when the pack has only one category, since it would just repeat the pack the player already picked', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Theme Technology', categories: ['Technology'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'Technology' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBeUndefined()
  })

  it('uses the release year as the hint on top of a single-category pack, since it is not redundant with the pack', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Songs', categories: ['Song'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'Song', metadata: { artist: 'The Beatles' } }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('by The Beatles')
  })

  it('appends the release year to a multi-category hint for movies/TV', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Movies', categories: ['Drama', 'Comedy'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, source: 'movie', category: 'Drama', metadata: { year: '1994' } }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Drama · 1994')
  })

  it('title-cases ALL CAPS categories without altering punctuation', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Trivia', categories: ['JACK BE HOMONYM-BLE', 'OTHER'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'JACK BE HOMONYM-BLE' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Jack Be Homonym-Ble')
  })

  it('still fully title-cases an ALL CAPS category with an incidental lowercase ordinal suffix', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Trivia', categories: ['20th CENTURY WOMEN', 'OTHER'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: '20th CENTURY WOMEN' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('20th Century Women')
  })

  it('preserves a real acronym in an otherwise mixed-case category', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Theme USPresidents', categories: ['US President', 'Other'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'US President' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('US President')
  })

  it('title-cases lowercase kebab-slug categories, keeping hyphens', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Phrases', categories: ['food-and-drink', 'what-are-you-doing'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, category: 'what-are-you-doing' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('What-Are-You-Doing')
  })

  it('leaves a bare movie/TV genre category unsuffixed, since the pack name shown alongside it already supplies the subject', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Movies', categories: ['Action', 'Comedy'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, source: 'movie', category: 'Action' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Action')
  })

  it('does not repeat the ungenred movie/TV fallback category', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], label: 'Tv Shows', categories: ['TV Show', 'Comedy'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, source: 'tv', category: 'TV Show' }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('TV Show')
  })

  it('prefers an explicit per-puzzle hint (custom packs) over the category-derived hint', () => {
    mockGetPuzzleManifest.mockReturnValue(fakeManifest)
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, metadata: { hint: 'A famous rock band' } }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('A famous rock band')
  })

  it('falls back to the category-derived hint when the explicit hint is blank', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...fakeManifest[0], categories: ['Classic Rock', 'Pop'] }])
    mockGetPuzzlesForCategory.mockReturnValue([{ ...fakePuzzle, metadata: { hint: '   ' } }])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.hint).toBe('Classic Rock')
  })
})

describe('resolvePuzzle - random source mode, multiple packs selected', () => {
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

  const allPackKeys = [packA.key, packB.key]

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

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, allPackKeys)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(['THE BEATLES', 'JURASSIC PARK']).toContain(result.payload.phrase)
      expect(result.payload.sourceMode).toBe('random')
      expect(['bands', 'movies']).toContain(result.payload.packKey)
      expect(result.payload.packScope).toBe('selection')
    }
  })

  it('picks deterministically when only one pack is eligible', () => {
    mockGetPuzzleManifest.mockReturnValue([packA, packB])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return [bandPuzzle]
      return []
    })

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, allPackKeys)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.packKey).toBe('bands')
      expect(result.payload.phrase).toBe('THE BEATLES')
      expect(result.payload.puzzleId).toBe('bands-1')
      // packScope reflects how many packs were eligible to be searched (allPackKeys.length === 2),
      // not how many actually had a matching puzzle — the player asked to draw from their whole
      // selection, they just happened to land on the one pack that had something available.
      expect(result.payload.packScope).toBe('selection')
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
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random', difficulty: 'hard' }, allPackKeys)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.packKey).toBe('movies')
  })

  it('returns ok:false when no pack qualifies for the requested difficulty at all', () => {
    mockGetPuzzleManifest.mockReturnValue([packA])
    mockGetPuzzlesForCategory.mockReturnValue([bandPuzzle])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random', difficulty: 'hard' }, [packA.key])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when the manifest has no packs with puzzles', () => {
    mockGetPuzzleManifest.mockReturnValue([{ ...packA, count: 0 }])
    mockGetPuzzlesForCategory.mockReturnValue([])

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, [packA.key])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

describe('resolvePuzzle - prefers unsolved puzzles over repeats', () => {
  const packA = {
    key: 'bands',
    file: 'bands.json',
    label: 'Bands',
    count: 3,
    difficultyTiers: ['easy'] as const,
    sources: [] as string[],
    categories: [] as string[]
  }

  const packB = {
    key: 'movies',
    file: 'movies.json',
    label: 'Movies',
    count: 2,
    difficultyTiers: ['easy'] as const,
    sources: [] as string[],
    categories: [] as string[]
  }

  const makePuzzle = (id: string, answer: string) => ({
    id,
    source: 'test',
    type: 'test',
    answer,
    normalizedAnswer: answer.toUpperCase(),
    category: 'Test',
    difficulty: 1,
    difficultyTier: 'easy' as const,
    wordCount: 1,
    letterCount: answer.length,
    uniqueLetterCount: new Set(answer.toUpperCase()).size
  })

  const bandsPuzzles = [makePuzzle('bands-1', 'ONE'), makePuzzle('bands-2', 'TWO'), makePuzzle('bands-3', 'SIX')]
  const moviesPuzzles = [makePuzzle('movies-1', 'CAT'), makePuzzle('movies-2', 'DOG')]

  beforeEach(() => {
    mockGetPuzzleManifest.mockReset()
    mockGetPuzzlesForCategory.mockReset()
    mockGetPuzzleManifest.mockReturnValue([packA])
    mockGetPuzzlesForCategory.mockImplementation((key: string) => {
      if (key === 'bands') return bandsPuzzles
      if (key === 'movies') return moviesPuzzles
      return []
    })
  })

  it('always returns the one remaining unsolved puzzle in a single pack, never a repeat', () => {
    const unlockedByPack = { bands: ['bands-1', 'bands-2'] }

    for (let i = 0; i < 10; i++) {
      const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'], unlockedByPack)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.payload.puzzleId).toBe('bands-3')
    }
  })

  it('falls back to the full (repeats-allowed) pool once every puzzle in the pack is unlocked', () => {
    const unlockedByPack = { bands: ['bands-1', 'bands-2', 'bands-3'] }

    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'], unlockedByPack)

    expect(result.ok).toBe(true)
    if (result.ok) expect(['bands-1', 'bands-2', 'bands-3']).toContain(result.payload.puzzleId)
  })

  it('flattens preference across every eligible pack, not just whichever pack is picked first', () => {
    mockGetPuzzleManifest.mockReturnValue([packA, packB])
    // Pack A (bands) is fully solved; pack B (movies) has one unsolved puzzle left. The only
    // unsolved puzzle across BOTH eligible packs should always win, regardless of which pack a
    // naive per-pack-then-random approach might have tried first.
    const unlockedByPack = { bands: ['bands-1', 'bands-2', 'bands-3'], movies: ['movies-1'] }

    for (let i = 0; i < 10; i++) {
      const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands', 'movies'], unlockedByPack)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.payload.puzzleId).toBe('movies-2')
    }
  })

  it('draws with no preference (matching pre-existing behavior) when unlockedByPack is omitted', () => {
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'])

    expect(result.ok).toBe(true)
    if (result.ok) expect(['bands-1', 'bands-2', 'bands-3']).toContain(result.payload.puzzleId)
  })

  it('treats a pack missing from unlockedByPack as having nothing unlocked yet', () => {
    // bands has no entry at all in unlockedByPack — same as {} for that key, not an error.
    const result = resolvePuzzle({ ...baseConfig, sourceMode: 'random' }, ['bands'], { movies: ['movies-1'] })

    expect(result.ok).toBe(true)
    if (result.ok) expect(['bands-1', 'bands-2', 'bands-3']).toContain(result.payload.puzzleId)
  })
})

describe('resolveChosenPuzzle', () => {
  const chosenPack = {
    key: 'bands',
    file: 'bands.json',
    label: 'Bands',
    count: 2,
    difficultyTiers: ['easy', 'medium'] as const,
    sources: [] as string[],
    // More than one category — otherwise buildHint has nothing to say for this pack and
    // payload.hint would be undefined regardless of whether the right pack/puzzle reached it.
    categories: ['Classic Rock', 'Pop'] as string[]
  }

  const chosenPuzzle = {
    id: 'bands-1',
    source: 'music-band',
    type: 'band',
    answer: 'The Beatles',
    normalizedAnswer: 'THE BEATLES',
    category: 'Classic Rock',
    difficulty: 1,
    difficultyTier: 'medium' as const,
    wordCount: 2,
    letterCount: 10,
    uniqueLetterCount: 8,
    // Distinctive enough that a copy-paste slip feeding buildHint the wrong pack/puzzle object
    // would change this value, not just leave it undefined either way.
    metadata: { year: '1965' }
  }

  beforeEach(() => {
    mockGetPuzzleManifest.mockReset()
    mockGetPuzzlesForCategory.mockReset()
  })

  it('returns ok:true with that exact puzzle, not a random draw, for a valid packKey/puzzleId', () => {
    mockGetPuzzleManifest.mockReturnValue([chosenPack])
    mockGetPuzzlesForCategory.mockReturnValue([chosenPuzzle])

    const result = resolveChosenPuzzle('bands', 'bands-1', fakeMode)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.phrase).toBe('THE BEATLES')
      expect(result.payload.mode).toBe(fakeMode)
      expect(result.payload.sourceMode).toBe('random')
      expect(result.payload.packKey).toBe('bands')
      expect(result.payload.packLabel).toBe('Bands')
      expect(result.payload.puzzleId).toBe('bands-1')
      expect(result.payload.difficultyTier).toBe('medium')
      // Built from THIS puzzle/pack's own category and year, via the same buildHint the random
      // draw uses — proves resolveChosenPuzzle feeds it the looked-up pack/puzzle, not a
      // mismatched or stale pair that would produce a different (or undefined) hint.
      expect(result.payload.hint).toBe('Classic Rock · 1965')
      // A player-picked puzzle is always from one specific pack they were already browsing.
      expect(result.payload.packScope).toBe('single')
    }
  })

  it('returns ok:false when the pack itself no longer exists', () => {
    mockGetPuzzleManifest.mockReturnValue([])
    mockGetPuzzlesForCategory.mockReturnValue([chosenPuzzle])

    const result = resolveChosenPuzzle('bands', 'bands-1', fakeMode)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns ok:false when the puzzleId is not found in that pack', () => {
    mockGetPuzzleManifest.mockReturnValue([chosenPack])
    mockGetPuzzlesForCategory.mockReturnValue([chosenPuzzle])

    const result = resolveChosenPuzzle('bands', 'not-a-real-id', fakeMode)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })

  it("picks the requested puzzle out of several, not just whichever comes first in the pack's list", () => {
    const otherPuzzle = { ...chosenPuzzle, id: 'bands-2', answer: 'Queen', normalizedAnswer: 'QUEEN' }
    mockGetPuzzleManifest.mockReturnValue([chosenPack])
    mockGetPuzzlesForCategory.mockReturnValue([chosenPuzzle, otherPuzzle])

    const result = resolveChosenPuzzle('bands', 'bands-2', fakeMode)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.phrase).toBe('QUEEN')
  })
})
