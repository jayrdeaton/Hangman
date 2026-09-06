import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE } from '@/modes/registry'
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
    // SketchWord takes fontSize as a direct prop, not a style object — no measured layout has
    // landed in this test environment (no onLayout fired for art-and-word-area/wordRow), so
    // PuzzleStage's shrink-to-fit falls through to its unclamped base ceiling (see its own "if
    // (availableWidth <= 0 && wordAreaHeight === undefined) return baseFontSize" branch).
    // visualMode has hasVisual: true (the default) — the letter display uses the smaller of the
    // two reserved font sizes while there's still room for artwork (see PuzzleStage.tsx's
    // WORD_FONT_SIZE).
    expect(displayBefore.props.children[0].props.fontSize).toBe(42)

    // The mode summary row (PuzzleDrawer.tsx's own handleOpenModePicker) opens ModePickerDrawer —
    // the full-page picker that replaced the old inline carousel this test used to poke at
    // directly via a manually-fired layout event. draft.mode there reflects the persisted config
    // (DEFAULT_MODE), not necessarily the currently-playing round's own mode — same reasoning
    // PuzzleDrawer.test.tsx's own comment gives for using DEFAULT_MODE here too.
    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByLabelText(`Mode: ${DEFAULT_MODE.label}. Change mode`))
    // Cards are plain Views, not Pressables — scrolling the carousel to a card is what selects it
    // (see ModePickerDrawer's own handleScroll/commitIndex and ModePickerDrawer.test.tsx's
    // identical comment). offsetX: 0 lands on index 0 (Letters Only, the first VISIBLE_MODES
    // entry) regardless of this test environment's own windowWidth, since 0 / anything is still 0.
    await fireEvent.scroll(getByTestId('mode-picker-carousel'), { nativeEvent: { contentOffset: { x: 0, y: 0 } } })

    const displayAfter = getByLabelText('Secret word display')
    // Letters Only has hasVisual: false, enlarging the letter display (WORD_FONT_SIZE_LARGE) —
    // reflected immediately, with the drawer's confirm button never pressed and no second
    // resolvePuzzle call (same round, same puzzle, just a different look).
    expect(displayAfter.props.children[0].props.fontSize).toBe(80)
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

  it("corrects the very first puzzle draw to the player's persisted pack selection once it loads from storage, instead of leaving cold boot's own 'every pack' fallback stand", async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => Promise.resolve(key === 'selectedPackKeys' ? JSON.stringify(['pack-1']) : null))
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ phrase: 'DOG', packKey: 'every-pack-draw' }) }).mockReturnValueOnce({ ok: true, payload: payload({ phrase: 'FISH', packKey: 'pack-1' }) })

    await renderApp()

    // The very first, synchronous draw can only ever run under whatever selectedPackKeys already
    // is in memory at mount — the persisted selection hasn't been read back from AsyncStorage yet.
    expect(mockResolvePuzzle.mock.calls[0][1]).not.toEqual(['pack-1'])

    // Once that read resolves, the first round gets corrected the same way a manual mode/
    // difficulty pick would — a second draw, this time actually scoped to the persisted packs.
    await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(2))
    expect(mockResolvePuzzle.mock.calls[1][1]).toEqual(['pack-1'])
  })

  it('leaves a round the player has already started guessing alone, rather than silently swapping it out once the persisted pack selection resolves', async () => {
    let resolveStorage: (value: string | null) => void = () => {}
    const pending = new Promise<string | null>((resolve) => {
      resolveStorage = resolve
    })
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation((key: string) => (key === 'selectedPackKeys' ? pending : Promise.resolve(null)))
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: payload({ phrase: 'DOG' }) })

    const { getByText } = await renderApp()

    // A correct guess that doesn't end the round — same "there's something to protect" condition
    // shouldConfirmAbandon itself uses for every other puzzle-switch path in Main.tsx.
    await fireEvent.press(getByText('D'))

    // The persisted selection resolves to a genuinely different set (see the previous test), but
    // this round already has an undecided guess on it — the correction should skip it entirely
    // rather than silently discard the guess with no abandon-confirmation dialog and no loss
    // recorded, the way every other puzzle-switch path in this file requires.
    await act(async () => {
      resolveStorage(JSON.stringify(['pack-1']))
      await pending
    })

    expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
  })
})
