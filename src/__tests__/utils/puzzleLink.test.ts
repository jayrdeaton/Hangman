import { classicMode, DEFAULT_MODE, robotMode } from '@/modes/registry'
import { buildPuzzleLink, parseSharedPuzzle } from '@/utils/puzzleLink'

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
      packKey: '',
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
