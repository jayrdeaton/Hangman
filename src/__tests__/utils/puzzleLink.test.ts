import { classicMode, DEFAULT_MODE, robotMode } from '@/modes/registry'
import { buildPuzzleLink, parseSharedPuzzle, parseSharedPuzzleParams } from '@/utils/puzzleLink'

type MockQueryParams = Record<string, string | undefined>

type MockCreateURLOptions = {
  queryParams?: MockQueryParams
}

type MockParsedURL = {
  scheme: string | null
  hostname: string | null
  path: string | null
  queryParams: Record<string, string> | null
}

// A URL containing this marker is treated as unparsable by the mocked Linking.parse, letting us
// exercise the try/catch around a real Linking.parse failure without needing a native module.
const MALFORMED_MARKER = '__malformed__'

jest.mock('expo-linking', () => {
  const createURL = (path: string, options?: MockCreateURLOptions): string => {
    const url = new URL(path, 'https://test.example')
    if (options?.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, value)
      })
    }
    return url.toString()
  }

  const parse = (urlString: string): MockParsedURL => {
    if (urlString.includes('__malformed__')) throw new Error('Unable to parse URL')

    const url = new URL(urlString)
    const queryParams: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value
    })

    return {
      scheme: url.protocol.replace(':', ''),
      hostname: url.hostname || null,
      path: url.pathname,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : null
    }
  }

  return {
    useLinkingURL: () => null,
    clearInitialURL: jest.fn(),
    createURL,
    parse
  }
})

describe('buildPuzzleLink + parseSharedPuzzle round trip', () => {
  it('carries phrase, hint, and mode.id through a normal round trip', () => {
    const link = buildPuzzleLink({ phrase: 'HELLO WORLD', hint: 'A friendly greeting', mode: robotMode })

    const result = parseSharedPuzzle(link)

    expect(result).toEqual({
      sourceMode: 'custom',
      difficulty: 'any',
      mode: robotMode,
      customPhrase: 'HELLO WORLD',
      customHint: 'A friendly greeting'
    })
  })

  it('defaults customHint to an empty string when the hint query param is absent entirely', () => {
    const url = new URL('play', 'https://test.example')
    url.searchParams.set('phrase', 'HELLO')
    url.searchParams.set('mode', classicMode.id)

    const result = parseSharedPuzzle(url.toString())

    expect(result?.customHint).toBe('')
  })
})

describe('parseSharedPuzzle edge cases', () => {
  it('returns null when the phrase normalizes to nothing, even though the raw phrase is non-empty', () => {
    const link = buildPuzzleLink({ phrase: '12345', hint: '', mode: classicMode })

    expect(parseSharedPuzzle(link)).toBeNull()
  })

  it('returns null when the phrase is longer than 128 characters', () => {
    const longPhrase = 'A'.repeat(129)
    const link = buildPuzzleLink({ phrase: longPhrase, hint: '', mode: classicMode })

    expect(parseSharedPuzzle(link)).toBeNull()
  })

  it('returns null when the hint is longer than 80 characters', () => {
    const longHint = 'B'.repeat(81)
    const link = buildPuzzleLink({ phrase: 'HELLO', hint: longHint, mode: classicMode })

    expect(parseSharedPuzzle(link)).toBeNull()
  })

  it('falls back to DEFAULT_MODE for an unrecognized mode id, without throwing or returning null', () => {
    const url = new URL('play', 'https://test.example')
    url.searchParams.set('phrase', 'HELLO')
    url.searchParams.set('hint', 'A hint')
    url.searchParams.set('mode', 'totally-not-a-real-mode')

    const result = parseSharedPuzzle(url.toString())

    expect(result).not.toBeNull()
    expect(result?.mode).toBe(DEFAULT_MODE)
    expect(result?.customPhrase).toBe('HELLO')
  })

  it('returns null for the app root URL with no phrase query param at all', () => {
    expect(parseSharedPuzzle('https://test.example/play')).toBeNull()
  })

  it('catches a Linking.parse failure on a malformed URL and returns null instead of throwing', () => {
    const malformedUrl = `https://test.example/play?${MALFORMED_MARKER}=1`

    expect(() => parseSharedPuzzle(malformedUrl)).not.toThrow()
    expect(parseSharedPuzzle(malformedUrl)).toBeNull()
  })
})

// The /play route reads a link's query params straight from the router (useLocalSearchParams), so
// these are the same checks parseSharedPuzzle makes, on params that never went through a URL. A
// repeated param arrives as an array.
describe('parseSharedPuzzleParams', () => {
  it('turns a valid link into a custom puzzle with its own art and hint', () => {
    expect(parseSharedPuzzleParams({ phrase: 'HELLO WORLD', hint: 'A friendly greeting', mode: robotMode.id })).toEqual({
      sourceMode: 'custom',
      difficulty: 'any',
      mode: robotMode,
      customPhrase: 'HELLO WORLD',
      customHint: 'A friendly greeting'
    })
  })

  // Normalizing is resolvePuzzle's job: the phrase is handed on as it came, as long as some letter
  // survives normalizing.
  it('hands the raw phrase on unnormalized', () => {
    expect(parseSharedPuzzleParams({ phrase: 'hello, world!' })?.customPhrase).toBe('hello, world!')
  })

  it('defaults the hint to an empty string when the link has none', () => {
    expect(parseSharedPuzzleParams({ phrase: 'HELLO' })?.customHint).toBe('')
  })

  it.each([
    ['no phrase at all', {}],
    ['an empty phrase', { phrase: '' }],
    ['a repeated phrase param', { phrase: ['HELLO', 'WORLD'] }]
  ])('returns null for %s', (_label, params) => {
    expect(parseSharedPuzzleParams(params)).toBeNull()
  })

  it('returns null for a phrase longer than 128 characters, and takes one of exactly 128', () => {
    expect(parseSharedPuzzleParams({ phrase: 'A'.repeat(129) })).toBeNull()
    expect(parseSharedPuzzleParams({ phrase: 'A'.repeat(128) })?.customPhrase).toBe('A'.repeat(128))
  })

  it.each([['12345'], ['   '], ['!?-,.']])('returns null for %j, which has no letter left after normalizing', (phrase) => {
    expect(parseSharedPuzzleParams({ phrase })).toBeNull()
  })

  it('returns null for a hint longer than 80 characters, and takes one of exactly 80', () => {
    expect(parseSharedPuzzleParams({ phrase: 'HELLO', hint: 'B'.repeat(81) })).toBeNull()
    expect(parseSharedPuzzleParams({ phrase: 'HELLO', hint: 'B'.repeat(80) })?.customHint).toBe('B'.repeat(80))
  })

  it.each([
    ['an unknown mode id', { mode: 'totally-not-a-real-mode' }],
    ['no mode', {}],
    ['a repeated mode param', { mode: [robotMode.id, classicMode.id] }]
  ])('falls back to DEFAULT_MODE for %s, without returning null', (_label, params) => {
    const result = parseSharedPuzzleParams({ phrase: 'HELLO', hint: 'A hint', ...params })

    expect(result).not.toBeNull()
    expect(result?.mode).toBe(DEFAULT_MODE)
    expect(result?.customPhrase).toBe('HELLO')
  })

  it('gives the same answer as parseSharedPuzzle for the same link', () => {
    const params = { phrase: 'HELLO WORLD', hint: 'A friendly greeting', mode: robotMode.id }

    expect(parseSharedPuzzle(buildPuzzleLink({ phrase: params.phrase, hint: params.hint, mode: robotMode }))).toEqual(parseSharedPuzzleParams(params))
  })
})
