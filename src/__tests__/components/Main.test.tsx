import { fireEvent, render } from '@testing-library/react-native'
import * as Linking from 'expo-linking'
import { StyleSheet } from 'react-native'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import * as puzzlePicker from '@/utils/puzzlePicker'

// PuzzleDrawer also imports normalizePhrase and PuzzleConfig from this module — spreading the
// real module keeps those working and only overrides the one export these tests drive directly.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

// jest.setup.ts globally mocks useLinkingURL to always return null (no incoming link) — overridden
// here so the pending-share test below can simulate a link arriving after mount by changing what
// this returns and forcing a rerender. createURL/parse are real expo-linking calls in production
// but need a configured native manifest (app.json's scheme) that isn't available in this test
// environment — reimplemented with plain URL parsing instead, same approach as puzzleLink.test.ts.
jest.mock('expo-linking', () => {
  const createURL = (path: string, options?: { queryParams?: Record<string, string | undefined> }): string => {
    const url = new URL(path, 'https://test.example')
    Object.entries(options?.queryParams ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, value)
    })
    return url.toString()
  }

  const parse = (urlString: string) => {
    const url = new URL(urlString)
    const queryParams: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value
    })
    return { scheme: url.protocol.replace(':', ''), hostname: url.hostname || null, path: url.pathname, queryParams: Object.keys(queryParams).length > 0 ? queryParams : null }
  }

  return {
    useLinkingURL: jest.fn(() => null),
    clearInitialURL: jest.fn(),
    createURL,
    parse
  }
})

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockUseLinkingURL = jest.mocked(Linking.useLinkingURL)

// hasVisual defaults true — used for the "before" state in the live-mode-swap test.
const visualMode: GameMode = {
  id: 'test-main-visual',
  label: 'Test Main Visual',
  description: 'A test mode with artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// A single wrong guess ends the round — keeps the difficulty-carries-into-next-round test short.
const oneMistakeMode: GameMode = {
  id: 'test-main-one-mistake',
  label: 'Test Main One Mistake',
  description: 'A test mode that loses on the first wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 1,
  Visual: (() => null) as unknown as GameMode['Visual']
}

const payload = (overrides: Partial<GameStartPayload>): GameStartPayload => ({ phrase: 'DOG', mode: visualMode, sourceMode: 'random', packKey: 'pack-1', packLabel: 'Test Pack', puzzleId: 'puzzle-1', difficultyTier: 'easy', ...overrides })

const MODE_SELECTOR_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 200 } } }
const OTHER_MODE_ACCESSIBILITY_LABEL = /Letters Only mode/

const renderApp = () =>
  render(
    <Providers>
      <Main />
    </Providers>
  )

describe('Main', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    mockUseLinkingURL.mockReturnValue(null)
  })

  it('reflects a newly picked art style in the round already on screen immediately, without pressing New puzzle or ending the round', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: payload({ mode: visualMode }) })
    const { getByLabelText, getByTestId } = await renderApp()

    const displayBefore = getByLabelText('Secret word display')
    // visualMode has hasVisual: true (the default) — the letter display uses the smaller of the
    // two reserved font sizes while there's still room for artwork (see Game.tsx's WORD_FONT_SIZE).
    expect(StyleSheet.flatten(displayBefore.props.children[0].props.style).fontSize).toBe(30)

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent(getByTestId('mode-selector-container'), 'layout', MODE_SELECTOR_LAYOUT_EVENT)
    await fireEvent.press(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL))

    const displayAfter = getByLabelText('Secret word display')
    // Letters Only has hasVisual: false, enlarging the letter display (WORD_FONT_SIZE_LARGE) —
    // reflected immediately, with the drawer's confirm button never pressed and no second
    // resolvePuzzle call (same round, same puzzle, just a different look).
    expect(StyleSheet.flatten(displayAfter.props.children[0].props.style).fontSize).toBe(56)
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
  })

  it('keeps a live difficulty change out of the round already on screen, but applies it to the next round the moment this one ends — no New puzzle press required', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'DOG', puzzleId: 'puzzle-1' }) }).mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'FISH', puzzleId: 'puzzle-2' }) })
    const { getByLabelText, getByText, findByText } = await renderApp()

    await fireEvent.press(getByLabelText('Game Menu'))
    // The filter used to draw the FIRST round was whatever the default is ('any'), not yet touched.
    expect(mockResolvePuzzle.mock.calls[0][0].difficulty).toBe('any')

    await fireEvent.press(getByText('Hard'))
    await fireEvent.press(getByLabelText('Close'))

    // The puzzle already on screen was drawn before "Hard" was picked — changing the filter can't
    // retroactively change it, so the round plays out normally and ends on its own terms.
    await fireEvent.press(getByText('Q'))
    expect(await findByText('You lost!')).toBeTruthy()
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)

    await fireEvent.press(getByText('Next puzzle'))

    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
    // The live difficulty change is exactly what the automatic next round now reads — no drawer
    // confirm button involved anywhere in this flow.
    expect(mockResolvePuzzle.mock.calls[1][0].difficulty).toBe('hard')
  })

  it('does not apply a live mode pick to the round already on screen while a shared-puzzle link is pending, unconfirmed, in the drawer', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: payload({ mode: visualMode }) })
    const { getByLabelText, getByTestId, rerender } = await renderApp()

    const displayBefore = getByLabelText('Secret word display')
    expect(StyleSheet.flatten(displayBefore.props.children[0].props.style).fontSize).toBe(30)

    // A friend's shared-puzzle link arrives while the app is already running — Main.tsx opens the
    // drawer on its own to preview it (see the incoming-URL effect), deliberately leaving the round
    // already on screen (drawn above, from the mocked resolvePuzzle) untouched until the player
    // explicitly accepts or declines the share.
    const sharedUrl = Linking.createURL('play', { queryParams: { phrase: 'SURPRISE PARTY', hint: '', mode: 'classic' } })
    mockUseLinkingURL.mockReturnValue(sharedUrl)
    await rerender(
      <Providers>
        <Main />
      </Providers>
    )

    // The drawer opened on its own, previewing the SHARED word (not round A's) — confirms the
    // preview really is the pending share.
    expect(getByTestId('phrase-input').props.value).toBe('SURPRISE PARTY')

    // The player previews a different art style before deciding whether to accept the share — the
    // mode selector here is showing the share's mode, not round A's, so this must not reach round A.
    await fireEvent(getByTestId('mode-selector-container'), 'layout', MODE_SELECTOR_LAYOUT_EVENT)
    await fireEvent.press(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL))

    // Round A, still playing behind the drawer, is completely unaffected — no new resolvePuzzle
    // call, and its own art style untouched.
    const displayAfter = getByLabelText('Secret word display')
    expect(StyleSheet.flatten(displayAfter.props.children[0].props.style).fontSize).toBe(30)
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
  })
})
