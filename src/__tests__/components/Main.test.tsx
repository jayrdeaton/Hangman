import { fireEvent, render } from '@testing-library/react-native'
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

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)

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
  })

  it('reflects a newly picked art style in the round already on screen immediately, without pressing Random or ending the round', async () => {
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

  it('keeps a live difficulty change out of the round already on screen, but applies it to the next round the moment this one ends — no Random press required', async () => {
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

  it('keeps the single continue button inside the same pack for the automatic next round, when the finished puzzle came from a single-pack draw', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'DOG', packKey: 'pack-1', packScope: 'single' }) }).mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'FISH', packKey: 'pack-1', packScope: 'single' }) })
    const { getByText, findByText } = await renderApp()

    await fireEvent.press(getByText('Q'))
    expect(await findByText('You lost!')).toBeTruthy()

    await fireEvent.press(getByText('Next puzzle'))

    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
    expect(mockResolvePuzzle.mock.calls[1][1]).toEqual(['pack-1'])
  })

  it("draws the automatic next round from the player's whole pack selection, when the finished puzzle came from a selection-wide draw", async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'DOG', packKey: 'pack-1', packScope: 'selection' }) }).mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'FISH', packKey: 'pack-2', packScope: 'selection' }) })
    const { getByText, findByText } = await renderApp()

    await fireEvent.press(getByText('Q'))
    expect(await findByText('You lost!')).toBeTruthy()

    await fireEvent.press(getByText('Next puzzle'))

    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
    // Same packKeys the initial auto-start itself drew from (the live selection) — not narrowed to
    // the single pack the just-finished puzzle happened to land on.
    expect(mockResolvePuzzle.mock.calls[1][1]).toEqual(mockResolvePuzzle.mock.calls[0][1])
  })
})
